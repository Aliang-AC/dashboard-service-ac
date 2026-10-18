'use server';
/* Semua baca/tulis data lewat sini (server). Browser tidak pernah menyentuh Firestore langsung,
   jadi kunci Firebase Admin aman dan setiap aksi dicek dulu: sudah login + punya akses. */
import { FieldValue, type Transaction, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMe } from '@/lib/access';
import { nowTimeWIB, todayWIB } from '@/lib/format';
import {
  STATUS, ABS_ST, type AllData, type Order, type OrderInput, type Part, type Result, type Me,
  type Stok, type Mutasi, type Karyawan, type Absensi, type Catatan, type Settings, type Pengguna, type AbsRecord,
} from '@/lib/types';

class UserError extends Error {}

async function run(fn: (me: Me) => Promise<void>, ownerOnly = false): Promise<Result> {
  try {
    const me = await requireMe();
    if (ownerOnly && !me.owner) throw new UserError('Hanya pemilik yang bisa mengubah ini.');
    await fn(me);
    return { ok: true };
  } catch (e) {
    console.error(e);
    const msg = e instanceof UserError || (e instanceof Error && /akses|Database/.test(e.message)) ? e.message : 'Gagal menyimpan. Periksa koneksi lalu coba lagi.';
    return { ok: false, error: msg };
  }
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => s === '' || /^\d{2}:\d{2}$/.test(s);
const r3 = (n: number) => +n.toFixed(3);

/* ---------------- baca semua data ---------------- */
export async function loadAll(): Promise<{ ok: true; data: AllData } | { ok: false; error: string }> {
  try {
    const me = await requireMe();
    const db = adminDb();
    const docs = <T,>(s: FirebaseFirestore.QuerySnapshot) => s.docs.map(d => ({ id: d.id, ...d.data() }) as T);
    const [orders, stok, mutasi, karyawan, absensi, catatan, settings, pengguna] = await Promise.all([
      db.collection('orders').orderBy('createdAt', 'desc').limit(1000).get(),
      db.collection('stok').get(),
      db.collection('mutasi').orderBy('createdAt', 'desc').limit(50).get(),
      db.collection('karyawan').get(),
      db.collection('absensi').orderBy('tanggal', 'desc').limit(70).get(),
      db.collection('catatan').orderBy('createdAt', 'desc').limit(1000).get(),
      db.doc('settings/usaha').get(),
      me.owner ? db.collection('pengguna').get() : null,
    ]);
    return {
      ok: true,
      data: {
        me,
        orders: docs<Order>(orders), stok: docs<Stok>(stok), mutasi: docs<Mutasi>(mutasi),
        karyawan: docs<Karyawan>(karyawan), absensi: docs<Absensi>(absensi), catatan: docs<Catatan>(catatan),
        settings: (settings.data() as Settings) || {},
        pengguna: pengguna ? pengguna.docs.map(d => d.data() as Pengguna) : [],
        today: todayWIB(),
      },
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error && /akses|Database/.test(e.message) ? e.message : 'Gagal memuat data.' };
  }
}

/* ---------------- order + stok otomatis ---------------- */
/* Selisih pemakaian sparepart order lama vs baru → update stok (atomik) + jejak di mutasi.
   Order Batal dianggap tidak memakai sparepart. */
function applyStock(tx: Transaction, stokSnaps: Map<string, DocumentSnapshot>, oldO: Order | null, newO: Order | null) {
  const partsOf = (o: Order | null) => (!o || o.status === 'Batal' ? [] : o.parts || []);
  const delta: Record<string, number> = {};
  partsOf(oldO).forEach(p => (delta[p.itemId] = (delta[p.itemId] || 0) - p.qty));
  partsOf(newO).forEach(p => (delta[p.itemId] = (delta[p.itemId] || 0) + p.qty));
  const ref = (newO || oldO)!;
  const db = adminDb();
  for (const [id, raw] of Object.entries(delta)) {
    const d = r3(raw);
    const snap = stokSnaps.get(id);
    if (!d || !snap?.exists) continue;
    tx.update(snap.ref, { qty: FieldValue.increment(-d) });
    tx.create(db.collection('mutasi').doc(), {
      createdAt: Date.now(), tanggal: todayWIB(), itemId: id, nama: snap.get('nama') || '',
      jenis: d > 0 ? 'Keluar' : 'Kembali', qty: Math.abs(d), ket: `${ref.invoice || ''} · ${ref.pelanggan || ''}`,
    });
  }
}

async function readStok(tx: Transaction, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const db = adminDb();
  const snaps = uniq.length ? await tx.getAll(...uniq.map(id => db.doc('stok/' + id))) : [];
  return new Map(snaps.map(s => [s.id, s]));
}

export async function saveOrder(id: string | null, input: OrderInput): Promise<Result> {
  return run(async () => {
    const tanggal = str(input.tanggal, 10);
    if (!isDate(tanggal)) throw new UserError('Tanggal tidak valid.');
    const pelanggan = str(input.pelanggan, 120);
    if (!pelanggan) throw new UserError('Nama pelanggan wajib diisi.');
    const status = STATUS.includes(input.status) ? input.status : 'Terjadwal';
    const bayar = input.bayar === 'Lunas' ? 'Lunas' : 'Belum lunas';
    const jam = str(input.jam, 5);
    if (!isTime(jam)) throw new UserError('Jam tidak valid.');
    const rawParts = (input.parts || []).slice(0, 50)
      .map(p => ({ itemId: str(p.itemId, 64), qty: r3(Math.max(0, num(p.qty))), harga: Math.max(0, num(p.harga)) }))
      .filter(p => p.itemId && p.qty > 0);

    const db = adminDb();
    const ref = id ? db.doc('orders/' + id) : db.collection('orders').doc();
    await db.runTransaction(async tx => {
      const oldSnap = id ? await tx.get(ref) : null;
      if (id && !oldSnap?.exists) throw new UserError('Order tidak ditemukan (mungkin sudah dihapus).');
      const old = oldSnap ? ({ id: oldSnap.id, ...oldSnap.data() } as Order) : null;
      const stokSnaps = await readStok(tx, [...rawParts.map(p => p.itemId), ...(old?.parts || []).map(p => p.itemId)]);

      /* Nomor invoice berurutan per bulan: INV/2026/10/0001 */
      let invoice = old?.invoice || '';
      const counterRef = db.doc(`counters/inv-${tanggal.slice(0, 7)}`);
      let next = 0;
      if (!old) { const c = await tx.get(counterRef); next = (c.get('n') || 0) + 1; invoice = `INV/${tanggal.slice(0, 4)}/${tanggal.slice(5, 7)}/${String(next).padStart(4, '0')}`; }

      const parts: Part[] = rawParts.map(p => {
        const s = stokSnaps.get(p.itemId);
        const prev = old?.parts?.find(x => x.itemId === p.itemId);
        return { ...p, nama: s?.get('nama') || prev?.nama || '', satuan: s?.get('satuan') || prev?.satuan || '' };
      });
      const jasa = Math.max(0, num(input.jasa)), diskon = Math.max(0, num(input.diskon));
      const doc: Omit<Order, 'id'> = {
        tanggal, jam, pelanggan, hp: str(input.hp, 30), alamat: str(input.alamat, 300),
        teknisi: str(input.teknisi, 64), layanan: str(input.layanan, 120), unit: str(input.unit, 120),
        qtyUnit: Math.max(1, Math.round(num(input.qtyUnit)) || 1),
        jasa, parts, diskon, total: Math.max(0, jasa + parts.reduce((a, p) => a + p.qty * p.harga, 0) - diskon),
        status, bayar, metode: ['Tunai', 'Transfer', 'QRIS'].includes(input.metode) ? input.metode : '', ket: str(input.ket, 1000),
        invoice, createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
        paidAt: bayar === 'Lunas' ? old?.paidAt || todayWIB() : null,
      };
      if (!old) tx.set(counterRef, { n: next });
      tx.set(ref, doc);
      applyStock(tx, stokSnaps, old, { id: ref.id, ...doc });
    });
  });
}

export async function deleteOrder(id: string): Promise<Result> {
  return run(async () => {
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const old = { id: s.id, ...s.data() } as Order;
      const stokSnaps = await readStok(tx, (old.parts || []).map(p => p.itemId));
      tx.delete(ref);
      applyStock(tx, stokSnaps, old, null);
    });
  });
}

export async function setOrderStatus(id: string, status: Order['status']): Promise<Result> {
  return run(async () => {
    if (!STATUS.includes(status)) throw new UserError('Status tidak dikenal.');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const old = { id: s.id, ...s.data() } as Order;
      const stokSnaps = await readStok(tx, (old.parts || []).map(p => p.itemId));
      tx.update(ref, { status, updatedAt: Date.now() });
      applyStock(tx, stokSnaps, old, { ...old, status });
    });
  });
}

export async function setPaid(id: string, lunas: boolean): Promise<Result> {
  return run(async () => {
    await adminDb().doc('orders/' + str(id, 64)).update(lunas ? { bayar: 'Lunas', paidAt: todayWIB() } : { bayar: 'Belum lunas', paidAt: null });
  });
}

/* ---------------- stok ---------------- */
type StokInput = { nama: string; kategori: string; satuan: string; min: number; hargaBeli: number; hargaJual: number; qty?: number };

export async function saveStok(id: string | null, v: StokInput): Promise<Result> {
  return run(async () => {
    const nama = str(v.nama, 120);
    if (!nama) throw new UserError('Nama barang wajib diisi.');
    const doc = { nama, kategori: str(v.kategori, 40), satuan: str(v.satuan, 20), min: Math.max(0, num(v.min)), hargaBeli: Math.max(0, num(v.hargaBeli)), hargaJual: Math.max(0, num(v.hargaJual)) };
    const db = adminDb();
    if (id) { await db.doc('stok/' + str(id, 64)).update(doc); return; }
    const qty = r3(Math.max(0, num(v.qty)));
    const batch = db.batch();
    const ref = db.collection('stok').doc();
    batch.set(ref, { ...doc, qty });
    if (qty) batch.set(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: ref.id, nama, jenis: 'Masuk', qty, ket: 'Stok awal' });
    await batch.commit();
  });
}

export async function deleteStok(id: string): Promise<Result> {
  return run(async () => { await adminDb().doc('stok/' + str(id, 64)).delete(); });
}

export async function stokMasuk(id: string, qty: number, harga: number, ket: string): Promise<Result> {
  return run(async () => {
    const q = r3(num(qty));
    if (q <= 0) throw new UserError('Isi jumlah masuk lebih dari 0.');
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Barang tidak ditemukan.');
    const upd: Record<string, unknown> = { qty: FieldValue.increment(q) };
    if (num(harga) > 0) upd.hargaBeli = num(harga);
    const batch = db.batch();
    batch.update(ref, upd);
    batch.set(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Masuk', qty: q, ket: str(ket, 200) });
    await batch.commit();
  });
}

export async function stokKoreksi(id: string, qty: number, ket: string): Promise<Result> {
  return run(async () => {
    const q = r3(Math.max(0, num(qty)));
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Barang tidak ditemukan.');
      const diff = r3(q - (+s.get('qty') || 0));
      tx.update(ref, { qty: q });
      tx.create(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Koreksi', qty: (diff > 0 ? '+' : '') + diff, ket: str(ket, 200) || 'Hitung ulang' });
    });
  });
}

/* ---------------- karyawan & absensi ---------------- */
export async function saveKaryawan(id: string | null, v: { nama: string; peran: string; hp: string; nonaktif: boolean }): Promise<Result> {
  return run(async () => {
    const nama = str(v.nama, 80);
    if (!nama) throw new UserError('Nama wajib diisi.');
    const doc = { nama, peran: str(v.peran, 60), hp: str(v.hp, 30), nonaktif: !!v.nonaktif };
    const db = adminDb();
    if (id) await db.doc('karyawan/' + str(id, 64)).update(doc);
    else await db.collection('karyawan').add(doc);
  });
}

/* Absensi disimpan 1 dokumen per hari (id = YYYY-MM-DD), isinya records per karyawan. */
export async function absen(kid: string, kind: 'in' | 'out' | 'edit', v?: AbsRecord): Promise<Result> {
  return run(async () => {
    const d = todayWIB();
    let patch: AbsRecord;
    if (kind === 'in') patch = { status: 'Hadir', masuk: nowTimeWIB() };
    else if (kind === 'out') patch = { pulang: nowTimeWIB() };
    else {
      const masuk = str(v?.masuk, 5), pulang = str(v?.pulang, 5);
      if (!isTime(masuk) || !isTime(pulang)) throw new UserError('Jam tidak valid.');
      patch = { status: ABS_ST.includes(v?.status as never) ? v!.status : 'Hadir', ket: str(v?.ket, 200), masuk, pulang };
    }
    await adminDb().doc('absensi/' + d).set({ tanggal: d, records: { [str(kid, 64)]: patch } }, { merge: true });
  });
}

/* ---------------- catatan ---------------- */
type CatatanInput = Pick<Catatan, 'tipe' | 'judul' | 'isi' | 'tanggal' | 'jam' | 'pelanggan' | 'untuk'>;
export async function saveCatatan(id: string | null, v: CatatanInput): Promise<Result> {
  return run(async () => {
    const judul = str(v.judul, 160);
    if (!judul) throw new UserError('Judul wajib diisi.');
    const tanggal = str(v.tanggal, 10), jam = str(v.jam, 5);
    if ((tanggal && !isDate(tanggal)) || !isTime(jam)) throw new UserError('Tanggal/jam tidak valid.');
    const doc = { tipe: str(v.tipe, 30) || 'Pengingat', judul, isi: str(v.isi, 2000), tanggal, jam, pelanggan: str(v.pelanggan, 120), untuk: str(v.untuk, 64) };
    const db = adminDb();
    if (id) await db.doc('catatan/' + str(id, 64)).update(doc);
    else await db.collection('catatan').add({ ...doc, selesai: false, createdAt: Date.now() });
  });
}
export async function setCatatanDone(id: string, done: boolean): Promise<Result> {
  return run(async () => { await adminDb().doc('catatan/' + str(id, 64)).update(done ? { selesai: true, doneAt: Date.now() } : { selesai: false }); });
}
export async function deleteCatatan(id: string): Promise<Result> {
  return run(async () => { await adminDb().doc('catatan/' + str(id, 64)).delete(); });
}

/* ---------------- pengaturan & akses ---------------- */
export async function saveSettings(v: Settings): Promise<Result> {
  return run(async () => {
    const jamMasuk = str(v.jamMasuk, 5) || '08:00';
    if (!isTime(jamMasuk)) throw new UserError('Jam masuk tidak valid.');
    await adminDb().doc('settings/usaha').set({
      nama: str(v.nama, 120), alamat: str(v.alamat, 300), hp: str(v.hp, 30), jamMasuk, rekening: str(v.rekening, 1000),
      layanan: (v.layanan || []).slice(0, 100).map(l => ({ nama: str(l.nama, 120), harga: Math.max(0, num(l.harga)) })).filter(l => l.nama),
    });
  });
}

export async function addPengguna(email: string, nama: string): Promise<Result> {
  return run(async () => {
    const e = str(email, 200).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new UserError('Format email tidak valid.');
    await adminDb().doc('pengguna/' + e).set({ email: e, nama: str(nama, 80) });
  }, true);
}
export async function removePengguna(email: string): Promise<Result> {
  return run(async () => { await adminDb().doc('pengguna/' + str(email, 200).toLowerCase()).delete(); }, true);
}
