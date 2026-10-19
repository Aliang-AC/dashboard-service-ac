'use server';
/* Semua baca/tulis data lewat sini (server). Browser tidak pernah menyentuh Firestore langsung,
   jadi kunci Firebase Admin aman dan setiap aksi dicek dulu: sudah login + perannya cukup.
   Peran: owner (semua) > admin (semua kecuali harga modal, omzet, hapus, pengaturan) > karyawan (absen diri sendiri). */
import { FieldValue, type Transaction, type DocumentSnapshot } from 'firebase-admin/firestore';
import { clerkClient } from '@clerk/nextjs/server';
import { adminDb } from '@/lib/firebase-admin';
import { atLeast, requireMe } from '@/lib/access';
import { backupSheetUrl, runBackup } from '@/lib/backup';
import { arsipKoreksi, buatTokenQR, cekTokenQR, getLokasi, jarakMeter } from '@/lib/absen';
import { nowTimeWIB, todayWIB } from '@/lib/format';
import {
  STATUS, ABS_ST, type AllData, type Order, type OrderInput, type Part, type Result, type ResultOf, type Me, type Peran,
  type Stok, type Mutasi, type Karyawan, type Absensi, type Catatan, type Settings, type AbsRecord, type Lokasi,
} from '@/lib/types';

class UserError extends Error {}

const ROLE_MSG: Record<Peran, string> = {
  owner: 'Hanya pemilik yang bisa melakukan ini.',
  admin: 'Hanya pemilik atau admin yang bisa melakukan ini.',
  karyawan: 'Akun ini belum punya akses.',
};

async function guarded<T>(min: Peran, fn: (me: Me) => Promise<T>): Promise<ResultOf<T>> {
  try {
    const me = await requireMe();
    if (!atLeast(me.peran, min)) throw new UserError(ROLE_MSG[min]);
    return { ok: true, data: await fn(me) };
  } catch (e) {
    console.error(e);
    const msg = e instanceof UserError || (e instanceof Error && /akses|Database/.test(e.message)) ? e.message : 'Gagal menyimpan. Periksa koneksi lalu coba lagi.';
    return { ok: false, error: msg };
  }
}
async function run(min: Peran, fn: (me: Me) => Promise<void>): Promise<Result> {
  const r = await guarded(min, fn);
  return r.ok ? { ok: true } : r;
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => s === '' || /^\d{2}:\d{2}$/.test(s);
const r3 = (n: number) => +n.toFixed(3);

/* ---------------- baca data (disaring sesuai peran) ---------------- */
export async function loadAll(): Promise<ResultOf<AllData>> {
  const r = await guarded('karyawan', async me => {
    const db = adminDb();
    const docs = <T,>(s: FirebaseFirestore.QuerySnapshot) => s.docs.map(d => ({ id: d.id, ...d.data() }) as T);
    const staff = atLeast(me.peran, 'admin');
    const [orders, stok, mutasi, karyawan, absensi, catatan, settings, lokasi, backup] = await Promise.all([
      db.collection('orders').orderBy('createdAt', 'desc').limit(1000).get(),
      staff ? db.collection('stok').get() : null,
      staff ? db.collection('mutasi').orderBy('createdAt', 'desc').limit(50).get() : null,
      db.collection('karyawan').get(),
      db.collection('absensi').orderBy('tanggal', 'desc').limit(70).get(),
      db.collection('catatan').orderBy('createdAt', 'desc').limit(1000).get(),
      db.doc('settings/usaha').get(),
      getLokasi(),
      me.peran === 'owner' ? db.doc('settings/backup').get() : null,
    ]);
    const arsipId = me.peran === 'owner' ? (await db.doc('settings/arsip').get()).get('absensiSheetId') : null;

    let o = docs<Order>(orders), s = stok ? docs<Stok>(stok) : [], k = docs<Karyawan>(karyawan);
    let a = docs<Absensi>(absensi), c = docs<Catatan>(catatan);
    let st = (settings.data() as Settings) || {};
    const lok: Lokasi | null = staff ? lokasi : null;

    if (me.peran !== 'owner') s = s.map(x => ({ ...x, hargaBeli: null })); // harga modal hanya untuk pemilik
    if (me.peran === 'karyawan') {
      /* karyawan: hanya jadwal miliknya (tanpa angka uang), absensinya sendiri, catatan untuknya / semua */
      const kid = me.karyawanId || '__none__';
      o = o.filter(x => x.teknisi === kid).map(x => ({ ...x, jasa: 0, diskon: 0, total: 0, parts: x.parts.map(p => ({ ...p, harga: 0 })) }));
      k = k.filter(x => x.id === kid).map(x => ({ ...x, akun: x.akun }));
      a = a.map(d => ({ ...d, records: d.records?.[kid] ? { [kid]: d.records[kid] } : {} }));
      c = c.filter(x => !x.untuk || x.untuk === kid);
      st = { nama: st.nama, jamMasuk: st.jamMasuk };
    }
    return {
      me, orders: o, stok: s, mutasi: mutasi ? docs<Mutasi>(mutasi) : [], karyawan: k, absensi: a, catatan: c,
      settings: st, lokasi: lok, today: todayWIB(),
      backup: backup?.exists ? (backup.data() as { at: number; rows: number }) : null,
      backupUrl: me.peran === 'owner' ? backupSheetUrl() : null,
      arsipUrl: arsipId ? `https://docs.google.com/spreadsheets/d/${arsipId}/edit` : null,
    } satisfies AllData;
  });
  if (!r.ok && r.error.startsWith('Gagal menyimpan')) return { ok: false, error: 'Gagal memuat data.' };
  return r;
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
  return run('admin', async () => {
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
  return run('owner', async () => {
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
  return run('admin', async () => {
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
  return run('admin', async () => {
    await adminDb().doc('orders/' + str(id, 64)).update(lunas ? { bayar: 'Lunas', paidAt: todayWIB() } : { bayar: 'Belum lunas', paidAt: null });
  });
}

/* ---------------- stok (harga beli hanya bisa diubah pemilik) ---------------- */
type StokInput = { nama: string; kategori: string; satuan: string; min: number; hargaBeli: number | null; hargaJual: number; qty?: number };

export async function saveStok(id: string | null, v: StokInput): Promise<Result> {
  return run('admin', async me => {
    const nama = str(v.nama, 120);
    if (!nama) throw new UserError('Nama barang wajib diisi.');
    const doc: Record<string, unknown> = { nama, kategori: str(v.kategori, 40), satuan: str(v.satuan, 20), min: Math.max(0, num(v.min)), hargaJual: Math.max(0, num(v.hargaJual)) };
    if (me.peran === 'owner') doc.hargaBeli = Math.max(0, num(v.hargaBeli));
    const db = adminDb();
    if (id) { await db.doc('stok/' + str(id, 64)).update(doc); return; }
    const qty = r3(Math.max(0, num(v.qty)));
    const batch = db.batch();
    const ref = db.collection('stok').doc();
    batch.set(ref, { hargaBeli: 0, ...doc, qty });
    if (qty) batch.set(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: ref.id, nama, jenis: 'Masuk', qty, ket: 'Stok awal' });
    await batch.commit();
  });
}

export async function deleteStok(id: string): Promise<Result> {
  return run('owner', async () => { await adminDb().doc('stok/' + str(id, 64)).delete(); });
}

export async function stokMasuk(id: string, qty: number, harga: number, ket: string): Promise<Result> {
  return run('admin', async me => {
    const q = r3(num(qty));
    if (q <= 0) throw new UserError('Isi jumlah masuk lebih dari 0.');
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Barang tidak ditemukan.');
    const upd: Record<string, unknown> = { qty: FieldValue.increment(q) };
    if (me.peran === 'owner' && num(harga) > 0) upd.hargaBeli = num(harga);
    const batch = db.batch();
    batch.update(ref, upd);
    batch.set(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Masuk', qty: q, ket: str(ket, 200) });
    await batch.commit();
  });
}

export async function stokKoreksi(id: string, qty: number, ket: string): Promise<Result> {
  return run('admin', async () => {
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

/* ---------------- karyawan & akun login nomor HP ---------------- */
type KaryawanInput = { nama: string; peran: string; hp: string; nonaktif: boolean; liburMingguan: number[] };

export async function saveKaryawan(id: string | null, v: KaryawanInput): Promise<Result> {
  return run('admin', async () => {
    const nama = str(v.nama, 80);
    if (!nama) throw new UserError('Nama wajib diisi.');
    const libur = [...new Set((v.liburMingguan || []).map(Number).filter(h => h >= 0 && h <= 6))].sort();
    const doc = { nama, peran: str(v.peran, 60), hp: str(v.hp, 30), nonaktif: !!v.nonaktif, liburMingguan: libur };
    const db = adminDb();
    if (id) await db.doc('karyawan/' + str(id, 64)).update(doc);
    else await db.collection('karyawan').add({ ...doc, akun: null, createdAt: Date.now() });
  });
}

/* nomor HP → username Clerk: hanya angka, 08xx… (contoh 081234567890) */
const usernameDari = (hp: string) => {
  let d = String(hp || '').replace(/\D/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  if (!/^0\d{8,13}$/.test(d)) throw new UserError('Nomor HP tidak valid. Contoh: 081234567890.');
  return d;
};
/* minimal 6 karakter (boleh angka saja seperti PIN); Clerk mengunci akun sementara kalau salah berkali-kali */
const cekPassword = (p: string) => { if (String(p || '').length < 6) throw new UserError('Password minimal 6 karakter.'); return String(p); };
const clerkMsg = (e: unknown) => {
  const errs = (e as { errors?: { code?: string; longMessage?: string; message?: string }[] })?.errors;
  const code = errs?.[0]?.code || '';
  if (/form_identifier_exists|username_exists/.test(code)) return 'Nomor HP ini sudah dipakai akun lain.';
  if (/form_password_pwned/.test(code)) return 'Password terlalu umum. Pakai kombinasi lain.';
  if (/form_param_unknown|not_allowed|username/.test(code + (errs?.[0]?.message || '')))
    return 'Login nomor HP belum diaktifkan di Clerk (Username + Password). Lihat panduan di chat.';
  return 'Gagal membuat akun: ' + (errs?.[0]?.longMessage || errs?.[0]?.message || 'coba lagi.');
};

/* Pemilik boleh membuat akun admin/karyawan; admin hanya akun karyawan, dan tidak bisa mengubah akun admin. */
async function karyawanUntukAkun(me: Me, kid: string) {
  const snap = await adminDb().doc('karyawan/' + str(kid, 64)).get();
  if (!snap.exists) throw new UserError('Karyawan tidak ditemukan.');
  const k = { id: snap.id, ...snap.data() } as Karyawan;
  if (me.peran !== 'owner' && k.akun?.peran === 'admin') throw new UserError('Hanya pemilik yang bisa mengubah akun admin.');
  return k;
}

export async function buatAkun(kid: string, hp: string, password: string, peran: 'admin' | 'karyawan'): Promise<Result> {
  return run('admin', async me => {
    if (peran === 'admin' && me.peran !== 'owner') throw new UserError('Hanya pemilik yang bisa membuat akun admin.');
    const k = await karyawanUntukAkun(me, kid);
    if (k.akun) throw new UserError('Karyawan ini sudah punya akun login.');
    const username = usernameDari(hp), pw = cekPassword(password);
    const role = peran === 'admin' ? 'admin' : 'karyawan';
    const clerk = await clerkClient();
    let uid: string;
    try {
      const u = await clerk.users.createUser({ username, password: pw, firstName: k.nama.slice(0, 50), skipPasswordChecks: true });
      uid = u.id;
    } catch (e) { console.error(e); throw new UserError(clerkMsg(e)); }
    const db = adminDb();
    const batch = db.batch();
    batch.set(db.doc('akun/' + uid), { peran: role, karyawanId: k.id, nama: k.nama, username, createdAt: Date.now(), oleh: me.nama });
    batch.update(db.doc('karyawan/' + k.id), { akun: { uid, username, peran: role } });
    await batch.commit();
  });
}

export async function resetPassword(kid: string, password: string): Promise<Result> {
  return run('admin', async me => {
    const k = await karyawanUntukAkun(me, kid);
    if (!k.akun) throw new UserError('Karyawan ini belum punya akun.');
    const pw = cekPassword(password);
    try { await (await clerkClient()).users.updateUser(k.akun.uid, { password: pw, skipPasswordChecks: true, signOutOfOtherSessions: true }); }
    catch (e) { console.error(e); throw new UserError(clerkMsg(e)); }
  });
}

export async function hapusAkun(kid: string): Promise<Result> {
  return run('admin', async me => {
    const k = await karyawanUntukAkun(me, kid);
    if (!k.akun) return;
    try { await (await clerkClient()).users.deleteUser(k.akun.uid); } catch (e) { console.error(e); /* akun mungkin sudah terhapus di Clerk */ }
    const db = adminDb();
    const batch = db.batch();
    batch.delete(db.doc('akun/' + k.akun.uid));
    batch.update(db.doc('karyawan/' + k.id), { akun: null });
    await batch.commit();
  });
}

/* ---------------- absensi ---------------- */
/* Token QR untuk Layar Absen (pemilik/admin). Berganti tiap 30 detik. */
export async function qrToken(): Promise<ResultOf<{ token: string; sisa: number }>> {
  return guarded('admin', async () => buatTokenQR());
}

/* Karyawan scan QR di bengkel: cek token, cek GPS ≤ radius, lalu catat masuk (atau pulang kalau sudah masuk). */
export async function absenQR(token: string, lat: number, lng: number, acc: number): Promise<ResultOf<{ jenis: 'masuk' | 'pulang'; jam: string; jarak: number; nama: string }>> {
  return guarded('karyawan', async me => {
    if (!me.karyawanId) throw new UserError('Akun ini belum terhubung ke data karyawan.');
    if (!(await cekTokenQR(token))) throw new UserError('QR sudah kedaluwarsa. Scan ulang QR yang sedang tampil di layar bengkel.');
    if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new UserError('Lokasi HP tidak terbaca. Nyalakan GPS lalu coba lagi.');
    const lok = await getLokasi();
    const jarak = jarakMeter({ lat, lng }, lok);
    if (jarak > lok.radius) throw new UserError(`Absen ditolak: posisi Anda ${jarak} m dari bengkel (batas ${lok.radius} m).`);

    const db = adminDb();
    const d = todayWIB(), jam = nowTimeWIB();
    const kSnap = await db.doc('karyawan/' + me.karyawanId).get();
    if (!kSnap.exists || kSnap.get('nonaktif')) throw new UserError('Data karyawan tidak aktif.');
    const ref = db.doc('absensi/' + d);
    const loc = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), jarak, acc: Math.round(num(acc)) };
    const jenis = await db.runTransaction(async tx => {
      const r = ((await tx.get(ref)).get('records') || {})[me.karyawanId!] as AbsRecord | undefined;
      if (r?.status && r.status !== 'Hadir') throw new UserError(`Hari ini Anda tercatat ${r.status}. Hubungi admin kalau keliru.`);
      if (!r?.masuk) {
        tx.set(ref, { tanggal: d, records: { [me.karyawanId!]: { status: 'Hadir', masuk: jam, masukLoc: loc, via: 'QR' } } }, { merge: true });
        return 'masuk' as const;
      }
      if (r.pulang) throw new UserError(`Anda sudah absen masuk (${r.masuk}) dan pulang (${r.pulang}) hari ini.`);
      const [h, m] = r.masuk.split(':').map(Number), [h2, m2] = jam.split(':').map(Number);
      if (h2 * 60 + m2 - (h * 60 + m) < 10) throw new UserError(`Anda baru saja absen masuk (${r.masuk}). Absen pulang nanti saat pulang.`);
      tx.set(ref, { tanggal: d, records: { [me.karyawanId!]: { pulang: jam, pulangLoc: loc } } }, { merge: true });
      return 'pulang' as const;
    });
    return { jenis, jam, jarak, nama: kSnap.get('nama') };
  });
}

/* Input manual oleh pemilik/admin (HP rusak, tugas luar, izin, libur). Alasan wajib; admin tidak bisa mengubah absensinya sendiri. */
export async function absenManual(kid: string, tanggal: string, v: AbsRecord): Promise<Result> {
  return run('admin', async me => {
    kid = str(kid, 64);
    if (me.peran !== 'owner' && kid === me.karyawanId) throw new UserError('Absensi Anda sendiri hanya bisa dikoreksi pemilik.');
    if (!isDate(tanggal) || tanggal > todayWIB()) throw new UserError('Tanggal tidak valid.');
    const masuk = str(v.masuk, 5), pulang = str(v.pulang, 5), ket = str(v.ket, 200);
    if (!isTime(masuk) || !isTime(pulang)) throw new UserError('Jam tidak valid.');
    if (!ket) throw new UserError('Alasan / keterangan wajib diisi untuk input manual.');
    const status = ABS_ST.includes(v.status as never) ? v.status! : 'Hadir';
    const rec: AbsRecord = { status, ket, masuk: status === 'Hadir' ? masuk : '', pulang: status === 'Hadir' ? pulang : '', via: 'Manual', oleh: me.nama };
    const db = adminDb();
    const ref = db.doc('absensi/' + tanggal);
    /* tulis ulang record karyawan ini (lokasi QR lama dibuang karena data dikoreksi) */
    await db.runTransaction(async tx => {
      const records = { ...(((await tx.get(ref)).get('records') || {}) as Record<string, AbsRecord>), [kid]: rec };
      tx.set(ref, { tanggal, records });
    });
    await arsipKoreksi(tanggal, (await db.doc('karyawan/' + kid).get()).get('nama') || kid, rec, me.nama);
  });
}

/* Hapus catatan absensi satu karyawan di satu tanggal — khusus pemilik. Jejaknya tetap tercatat di arsip Drive. */
export async function hapusAbsen(kid: string, tanggal: string): Promise<Result> {
  return run('owner', async me => {
    kid = str(kid, 64);
    if (!isDate(tanggal)) throw new UserError('Tanggal tidak valid.');
    const db = adminDb();
    const ref = db.doc('absensi/' + tanggal);
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const records = { ...((s.get('records') || {}) as Record<string, AbsRecord>) };
      delete records[kid];
      tx.set(ref, { tanggal, records });
    });
    await arsipKoreksi(tanggal, (await db.doc('karyawan/' + kid).get()).get('nama') || kid, null, me.nama);
  });
}

/* Libur dadakan / tanggal merah untuk semua karyawan aktif (yang belum hadir). */
export async function liburSemua(tanggal: string, ket: string): Promise<Result> {
  return run('admin', async me => {
    if (!isDate(tanggal)) throw new UserError('Tanggal tidak valid.');
    const db = adminDb();
    const [kar, abs] = await Promise.all([db.collection('karyawan').get(), db.doc('absensi/' + tanggal).get()]);
    const records = (abs.get('records') || {}) as Record<string, AbsRecord>;
    const patch: Record<string, AbsRecord> = {};
    kar.docs.forEach(d => {
      if (d.get('nonaktif') || records[d.id]?.status === 'Hadir') return;
      patch[d.id] = { status: 'Libur', ket: str(ket, 200) || 'Libur', via: 'Manual', oleh: me.nama };
    });
    if (Object.keys(patch).length) await db.doc('absensi/' + tanggal).set({ tanggal, records: patch }, { merge: true });
  });
}

/* ---------------- catatan ---------------- */
type CatatanInput = Pick<Catatan, 'tipe' | 'judul' | 'isi' | 'tanggal' | 'jam' | 'pelanggan' | 'untuk'>;
export async function saveCatatan(id: string | null, v: CatatanInput): Promise<Result> {
  return run('admin', async () => {
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
/* karyawan boleh menandai selesai catatan yang ditujukan untuknya / untuk semua */
export async function setCatatanDone(id: string, done: boolean): Promise<Result> {
  return run('karyawan', async me => {
    const ref = adminDb().doc('catatan/' + str(id, 64));
    if (me.peran === 'karyawan') {
      const s = await ref.get();
      if (!s.exists || (s.get('untuk') && s.get('untuk') !== me.karyawanId)) throw new UserError('Catatan ini bukan untuk Anda.');
    }
    await ref.update(done ? { selesai: true, doneAt: Date.now() } : { selesai: false });
  });
}
export async function deleteCatatan(id: string): Promise<Result> {
  return run('admin', async () => { await adminDb().doc('catatan/' + str(id, 64)).delete(); });
}

/* ---------------- pengaturan (pemilik) ---------------- */
export async function saveSettings(v: Settings): Promise<Result> {
  return run('owner', async () => {
    const jamMasuk = str(v.jamMasuk, 5) || '08:00';
    if (!isTime(jamMasuk)) throw new UserError('Jam masuk tidak valid.');
    await adminDb().doc('settings/usaha').set({
      nama: str(v.nama, 120), alamat: str(v.alamat, 300), hp: str(v.hp, 30), jamMasuk, rekening: str(v.rekening, 1000),
      layanan: (v.layanan || []).slice(0, 100).map(l => ({ nama: str(l.nama, 120), harga: Math.max(0, num(l.harga)) })).filter(l => l.nama),
    });
  });
}

export async function saveLokasi(v: Lokasi): Promise<Result> {
  return run('owner', async () => {
    const lat = num(v.lat), lng = num(v.lng), radius = Math.round(num(v.radius));
    if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new UserError('Koordinat tidak valid.');
    if (radius < 20 || radius > 1000) throw new UserError('Radius harus 20–1000 meter.');
    await adminDb().doc('settings/lokasi').set({ lat, lng, radius });
  });
}

export async function backupNow(): Promise<Result> {
  return run('owner', async () => {
    try { await runBackup(); }
    catch (e) {
      console.error(e);
      const m = e instanceof Error ? e.message : '';
      throw new UserError(
        /BACKUP_SHEET_ID/.test(m) ? 'Alamat Google Sheet backup belum diatur (BACKUP_SHEET_ID).'
          : /403|PERMISSION|disabled|has not been used/i.test(m) ? 'Google Sheets menolak akses. Pastikan Google Sheets API aktif dan sheet dibagikan ke akun robot Firebase.'
            : 'Backup gagal. Coba lagi beberapa saat lagi.',
      );
    }
  });
}
