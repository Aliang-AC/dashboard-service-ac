'use server';
/* Semua baca/tulis data lewat sini (server). Browser tidak pernah menyentuh Firestore langsung,
   jadi kunci Firebase Admin aman dan setiap aksi dicek dulu: sudah login + perannya cukup.
   Peran: owner (semua) > admin (semua kecuali harga modal, omzet, hapus, pengaturan) > karyawan (absen diri sendiri). */
import { FieldValue, type Transaction, type DocumentSnapshot } from 'firebase-admin/firestore';
import { clerkClient } from '@clerk/nextjs/server';
import { adminDb } from '@/lib/firebase-admin';
import { atLeast, requireMe } from '@/lib/access';
import { backupSheetUrl, runBackup } from '@/lib/backup';
import { buatBackupLengkap, catatGagalBackupLengkap } from '@/lib/backup-lengkap';
import { arsipKoreksi, buatTokenQR, cekTokenQR, getLokasi, jarakMeter } from '@/lib/absen';
import { buangFoto, fotoAktif, sambungSkrip, uploadFoto } from '@/lib/drive';
import { addDays, nowTimeWIB, rp, todayWIB } from '@/lib/format';
import { bacaVersi, tandaiBerubah } from '@/lib/versi';
import { alokasiBayar, hitungTotal, jumlahBayar, normOrder, statusBayar } from '@/lib/order';
import { labelUnit, tambahBulan } from '@/lib/servis';
import { pakaiRoll } from '@/lib/stok';
import { kodeDariTeks, kodeStiker, lokasiUnit, POLA_KODE, specUnit } from '@/lib/unit';
import { anggotaTim, PESAN_CEPAT, type Tim, type TimHari } from '@/lib/tim';
import { hargaOtomatis, JENIS_HARGA, TARIF_KOSONG, type PaketAC, type Tarif, type TarifLayanan } from '@/lib/tarif';
import { clerkUsername, cocokPin, hashPin, KUNCI_MENIT, MAKS_GAGAL, normalHp, passwordAcak } from '@/lib/pin';
import {
  STATUS, ABS_ST, METODE, JENIS_PELANGGAN, MODEL_INVOICE, PEMBELI, type Pembeli, POSISI, type AllData, type Order, type OrderInput, type OrderItem, type PaketOrder, type Part, type Result, type ResultOf, type Me, type Peran,
  type Pembayaran, type Metode, type Pelanggan, type UnitAC, type Status, type Foto, JENIS_FOTO, type Rekap,
  type Pengingat, HASIL_PENGINGAT, TIPE_LOKASI, type RiwayatUnit, type Stiker, type StatusStiker,
  type Stok, type Mutasi, type Karyawan, type Absensi, type Catatan, type Settings, type AbsRecord, type Lokasi, type Izin, JENIS_IZIN, jamMasukTgl, type Riwayat, posisiKaryawan,
} from '@/lib/types';

class UserError extends Error {}

const ROLE_MSG: Record<Peran, string> = {
  owner: 'Hanya pemilik yang bisa melakukan ini.',
  admin: 'Hanya pemilik atau admin yang bisa melakukan ini.',
  karyawan: 'Akun ini belum punya akses.',
  layar: 'Akun ini belum punya akses.',
};

/* baca = aksi yang hanya membaca (tidak menandai data berubah) */
async function guarded<T>(min: Peran, fn: (me: Me) => Promise<T>, baca = false): Promise<ResultOf<T>> {
  try {
    const me = await requireMe();
    if (!atLeast(me.peran, min)) throw new UserError(ROLE_MSG[min]);
    const data = await fn(me);
    if (!baca) await tandaiBerubah();
    return { ok: true, data };
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

/* ---------------- riwayat perubahan & tempat sampah ---------------- */
const fmtTglR = (t?: string) => (t ? new Date(t + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NAMA_DOC: Record<string, (d: any) => string> = {
  orders: d => [d.invoice, d.pelanggan, fmtTglR(d.tanggal)].filter(Boolean).join(' · '),
  pelanggan: d => d.nama, stok: d => d.nama, karyawan: d => d.nama, catatan: d => d.judul,
  izin: d => `${d.nama} · ${d.jenis} ${fmtTglR(d.dari)}`, rekap: d => `${d.nomor} · ${d.pelanggan}`, tim: d => 'Tim ' + fmtTglR(d.tanggal),
};
/* catat siapa mengubah apa & kapan (dibaca pemilik di menu Riwayat & Sampah). Tidak pernah menggagalkan aksi. */
async function catat(me: Me, aksi: string, koleksi: string, id: string, detail = '', judul?: string) {
  try {
    const db = adminDb();
    if (!judul && koleksi && id) { const d = await db.doc(`${koleksi}/${id}`).get(); judul = d.exists ? NAMA_DOC[koleksi]?.(d.data()) || id : id; }
    await db.collection('riwayat').add({ at: Date.now(), oleh: me.nama, peran: me.peran, aksi, koleksi, docId: id, judul: str(judul, 200), detail: str(detail, 400) });
  } catch (e) { console.error('riwayat', e); }
}
const HARI_SAMPAH = 30;
/* data yang dihapus disimpan dulu di tempat sampah (bisa dipulihkan pemilik sampai 30 hari) */
function keSampah(tx: Transaction, me: Me, koleksi: string, docId: string, data: unknown, judul: string, extra: Record<string, unknown> = {}) {
  const at = Date.now();
  tx.set(adminDb().collection('sampah').doc(), { koleksi, docId, data, judul: str(judul, 200), oleh: me.nama, at, hapusPada: at + HARI_SAMPAH * 86_400_000, ...extra });
}

/* pemilik: kembalikan data dari tempat sampah */
export async function pulihkanSampah(id: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    const sref = db.doc('sampah/' + str(id, 64));
    let judul = '';
    await db.runTransaction(async tx => {
      const s = await tx.get(sref);
      if (!s.exists) throw new UserError('Data sampah tidak ditemukan (mungkin sudah terhapus permanen).');
      const { koleksi, docId, data, kid } = s.data() as { koleksi: string; docId: string; data: Record<string, unknown>; kid?: string };
      judul = s.get('judul') || '';
      if (koleksi === 'absensi') {
        const aref = db.doc('absensi/' + docId);
        const records = ((await tx.get(aref)).get('records') || {}) as Record<string, AbsRecord>;
        if (kid && records[kid]) throw new UserError('Sudah ada absensi baru di tanggal itu untuk karyawan ini.');
        tx.set(aref, { tanggal: docId, records: { ...records, [kid!]: data } }, { merge: true });
      } else {
        const ref = db.doc(`${koleksi}/${docId}`);
        if ((await tx.get(ref)).exists) throw new UserError('Data dengan id yang sama sudah ada.');
        if (koleksi === 'orders') {
          /* order kembali → stok yang dipakai dikurangi lagi */
          const o = normOrder({ id: docId, ...data });
          const stokSnaps = await readStok(tx, idStok(o));
          applyStock(tx, stokSnaps, null, o);
        }
        if (koleksi === 'karyawan') data.akun = null; // akun login sudah dihapus; buatkan ulang bila perlu
        if (koleksi === 'pelanggan') {
          /* stiker unit dipasang lagi kalau masih kosong; kalau sudah dipakai unit lain, kodenya dilepas */
          const units = ((data.units || []) as UnitAC[]).map(u => ({ ...u }));
          const sn = await Promise.all(units.filter(u => u.kode).map(u => tx.get(db.doc('stiker/' + u.kode))));
          for (const u of units) {
            if (!u.kode) continue;
            const st = sn.find(x => x.id === u.kode);
            if (st?.exists && st.get('status') === 'kosong') tx.set(st.ref, { status: 'aktif', pelangganId: docId, unitId: u.id }, { merge: true });
            else delete u.kode;
          }
          data.units = units;
          data.unitKodes = kodesDari(units);
          data.updatedAt = Date.now();
        }
        tx.set(ref, data);
      }
      tx.delete(sref);
    });
    await catat(me, 'Dipulihkan dari tempat sampah', '', '', '', judul);
  });
}

/* pemilik: hapus permanen sekarang (tanpa menunggu 30 hari) */
export async function hapusPermanen(id: string): Promise<Result> {
  return run('owner', async me => {
    const ref = adminDb().doc('sampah/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) return;
    await ref.delete();
    await catat(me, 'Dihapus permanen', '', '', '', s.get('judul') || '');
  });
}

/* ---------------- baca data (disaring sesuai peran) ---------------- */
export async function loadAll(): Promise<ResultOf<AllData>> {
  const r = await guarded('karyawan', async me => {
    const db = adminDb();
    const versi = await bacaVersi();
    const docs = <T,>(s: FirebaseFirestore.QuerySnapshot) => s.docs.map(d => ({ id: d.id, ...d.data() }) as T);
    const staff = atLeast(me.peran, 'admin');
    const [orders, stok, mutasi, karyawan, absensi, catatan, settings, tarifSnap, lokasi, backup, pelanggan, adaFoto] = await Promise.all([
      db.collection('orders').orderBy('createdAt', 'desc').limit(1000).get(),
      db.collection('stok').get(),
      staff ? db.collection('mutasi').orderBy('createdAt', 'desc').limit(50).get() : null,
      db.collection('karyawan').get(),
      db.collection('absensi').orderBy('tanggal', 'desc').limit(70).get(),
      db.collection('catatan').orderBy('createdAt', 'desc').limit(1000).get(),
      db.doc('settings/usaha').get(),
      db.doc('settings/tarif').get(),
      getLokasi(),
      me.peran === 'owner' ? db.doc('settings/backup').get() : null,
      db.collection('pelanggan').get(),
      fotoAktif(),
    ]);
    const rekap = staff ? await db.collection('rekap').orderBy('createdAt', 'desc').limit(300).get() : null;
    const timSnap = await db.collection('tim').where('tanggal', '>=', addDays(todayWIB(), -7)).get();
    const [riwayatSnap, sampahSnap] = me.peran === 'owner'
      ? await Promise.all([db.collection('riwayat').orderBy('at', 'desc').limit(300).get(), db.collection('sampah').orderBy('at', 'desc').limit(300).get()])
      : [null, null];
    const izinSnap = await db.collection('izin').where('sampai', '>=', addDays(todayWIB(), -62)).get();
    let iz = docs<Izin>(izinSnap).sort((a, b) => b.at - a.at);
    const arsipId = me.peran === 'owner' ? (await db.doc('settings/arsip').get()).get('absensiSheetId') : null;
    const backupL = me.peran === 'owner' ? await db.doc('settings/backupLengkap').get() : null;

    /* order lama yang masih perlu diurus (belum lunas / belum ditagih) tetap ikut, supaya piutang selalu lengkap */
    const [blmLunas, blmTagih] = staff ? await Promise.all([
      db.collection('orders').where('bayar', 'in', ['Belum dibayar', 'Sebagian']).get(),
      db.collection('orders').where('belumDitagih', '==', true).get(),
    ]) : [null, null];
    const sudah = new Set(orders.docs.map(x => x.id));
    const tambahan = [...(blmLunas?.docs || []), ...(blmTagih?.docs || [])].filter(x => !sudah.has(x.id) && (sudah.add(x.id), true));
    let o = [...orders.docs, ...tambahan].map(d => normOrder({ id: d.id, ...d.data() })), s = docs<Stok>(stok), k = docs<Karyawan>(karyawan);
    let a = docs<Absensi>(absensi), c = docs<Catatan>(catatan), pl = docs<Pelanggan>(pelanggan);
    let st = (settings.data() as Settings) || {};
    let tarif = bacaTarif(tarifSnap.data());
    const lok: Lokasi | null = staff ? lokasi : null;

    if (me.peran !== 'owner') s = s.map(x => ({ ...x, hargaBeli: null })); // harga modal hanya untuk pemilik
    if (me.peran === 'karyawan') {
      /* karyawan: hanya jadwal miliknya (tanpa angka uang), absensinya sendiri, catatan untuknya / semua */
      const kid = me.karyawanId || '__none__';
      o = o.filter(x => x.teknisi.includes(kid)).map(x => ({
        ...x, diskon: 0, total: 0, dibayar: 0, pembayaran: [],
        items: x.items.map(i => ({ ...i, harga: 0 })), parts: x.parts.map(p => ({ ...p, harga: 0 })),
      }));
      k = k.filter(x => x.id === kid).map(x => ({ ...x, akun: x.akun }));
      a = a.map(d => ({ ...d, records: d.records?.[kid] ? { [kid]: d.records[kid] } : {} }));
      c = c.filter(x => !x.untuk || x.untuk === kid);
      iz = iz.filter(x => x.kid === kid);
      /* konsumen dari order yang ia tangani (untuk mencatat unit AC & pasang stiker di lokasi) */
      const pids = new Set(o.map(x => x.pelangganId).filter(Boolean));
      pl = pl.filter(x => pids.has(x.id)).map(x => ({ ...x, tempoHari: 0, catatan: '', pengingat: undefined }));
      /* untuk laporan teknisi: nama layanan & barang stok saja, tanpa harga */
      s = s.map(x => ({ ...x, hargaBeli: null, hargaJual: 0, hargaMitra: 0 }));
      /* teknisi: hanya nama layanan (tanpa harga & paket) untuk "tambah pekerjaan di lokasi" */
      tarif = { layanan: tarif.layanan.map(l => ({ id: l.id, nama: l.nama, jenis: l.jenis })), paket: [], infoPaket: {} };
      st = { nama: st.nama, jamMasuk: st.jamMasuk, jamMasukMinggu: st.jamMasukMinggu, pesanCepat: st.pesanCepat, layanan: tarif.layanan.map(l => ({ nama: l.nama, harga: 0 })) };
    }
    return {
      me, orders: o, stok: s, mutasi: mutasi ? docs<Mutasi>(mutasi) : [], karyawan: k, absensi: a, catatan: c,
      pelanggan: pl, rekap: rekap ? docs<Rekap>(rekap) : [], fotoAktif: adaFoto,
      settings: st, tarif, tim: docs<TimHari>(timSnap), izin: iz,
      riwayat: riwayatSnap ? docs<Riwayat>(riwayatSnap) : [],
      sampah: sampahSnap ? sampahSnap.docs.map(x => ({ id: x.id, koleksi: x.get('koleksi'), judul: x.get('judul'), oleh: x.get('oleh'), at: x.get('at'), hapusPada: x.get('hapusPada') })) : [], lokasi: lok, today: todayWIB(), versi,
      backup: backup?.exists ? (backup.data() as { at: number; rows: number }) : null,
      backupLengkap: backupL?.exists ? (backupL.data() as AllData['backupLengkap']) : null,
      backupUrl: me.peran === 'owner' ? backupSheetUrl() : null,
      arsipUrl: arsipId ? `https://docs.google.com/spreadsheets/d/${arsipId}/edit` : null,
    } satisfies AllData;
  }, true);
  if (!r.ok && r.error.startsWith('Gagal menyimpan')) return { ok: false, error: 'Gagal memuat data.' };
  return r;
}

/* ---------------- order + stok otomatis ---------------- */
/* Selisih pemakaian sparepart order lama vs baru → update stok (atomik) + jejak di mutasi.
   Order Batal dianggap tidak memakai sparepart. */
function applyStock(tx: Transaction, stokSnaps: Map<string, DocumentSnapshot>, oldO: Order | null, newO: Order | null) {
  const partsOf = (o: Order | null) => (!o || o.status === 'Batal' ? [] : pemakaianStok(o));
  const delta: Record<string, number> = {};
  partsOf(oldO).forEach(p => (delta[p.itemId] = (delta[p.itemId] || 0) - p.qty));
  partsOf(newO).forEach(p => (delta[p.itemId] = (delta[p.itemId] || 0) + p.qty));
  const ref = (newO || oldO)!;
  const db = adminDb();
  for (const [id, raw] of Object.entries(delta)) {
    const d = r3(raw);
    const snap = stokSnaps.get(id);
    if (!d || !snap?.exists) continue;
    const ket = `${ref.invoice || ''} · ${ref.pelanggan || ''}`;
    if (snap.get('roll')) {
      /* barang roll: pakai eceran dulu, kalau kurang roll utuh dibuka otomatis; yang kembali masuk ke eceran */
      const qty = +snap.get('qty') || 0, rolls: number[] = snap.get('rolls') || [];
      const hasil = d > 0 ? pakaiRoll(qty, rolls, d) : { qty: r3(qty - d), rolls, dibuka: [] as number[] };
      tx.update(snap.ref, { qty: hasil.qty, rolls: hasil.rolls });
      hasil.dibuka.forEach(p => tx.create(db.collection('mutasi').doc(), {
        createdAt: Date.now(), tanggal: todayWIB(), itemId: id, nama: snap.get('nama') || '', jenis: 'Buka roll', qty: p, ket: 'Otomatis · ' + ket,
      }));
    } else tx.update(snap.ref, { qty: FieldValue.increment(-d) });
    tx.create(db.collection('mutasi').doc(), {
      createdAt: Date.now(), tanggal: todayWIB(), itemId: id, nama: snap.get('nama') || '',
      jenis: d > 0 ? 'Keluar' : 'Kembali', qty: Math.abs(d), ket,
    });
  }
}

/* barang stok yang dipakai order: sparepart + isi paket AC baru (unit AC & alat) */
function pemakaianStok(o: Pick<Order, 'parts' | 'items'>) {
  return [
    ...(o.parts || []),
    ...(o.items || []).flatMap(i => (i.paket?.stok || []).map(x => ({ itemId: x.itemId, qty: r3(x.qty * (i.qty || 1)) }))),
  ];
}
const idStok = (o: Pick<Order, 'parts' | 'items'> | null) => (o ? pemakaianStok(o).map(p => p.itemId) : []);

async function readStok(tx: Transaction, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const db = adminDb();
  const snaps = uniq.length ? await tx.getAll(...uniq.map(id => db.doc('stok/' + id))) : [];
  return new Map(snaps.map(s => [s.id, s]));
}

const cleanItems = (items: OrderItem[]) => (items || []).slice(0, 60)
  .map(i => {
    const harga = Math.max(0, num(i.harga));
    return { layanan: str(i.layanan, 120), unit: str(i.unit, 160), qty: Math.max(1, Math.round(num(i.qty)) || 1), harga, unitId: str(i.unitId, 20), paketId: str(i.paket?.id, 40), perluHarga: !!i.perluHarga && harga <= 0 };
  })
  .filter(i => i.layanan);
/* paket di baris order: salinan dari daftar harga saat order dibuat; baris order lama dengan paket yang sama memakai salinan lamanya */
function pasangPaket(items: ReturnType<typeof cleanItems>, tarif: Tarif, lama: OrderItem[]): OrderItem[] {
  const lamaById = new Map(lama.filter(i => i.paket).map(i => [i.paket!.id, i.paket!]));
  return items.map(({ paketId, perluHarga, ...i }) => {
    const out: OrderItem = { ...i, ...(perluHarga ? { perluHarga } : {}) };
    if (!paketId) return out;
    const snap = lamaById.get(paketId) || paketOrder(tarif.paket.find(p => p.id === paketId), tarif);
    if (!snap) throw new UserError(`Paket pada baris "${i.layanan}" tidak ditemukan di daftar harga.`);
    return { ...out, paket: snap };
  });
}
const paketOrder = (p: PaketAC | undefined, t: Tarif): PaketOrder | undefined => p && {
  id: p.id, merk: p.merk, pk: p.pk, tipe: p.tipe, watt: p.watt || 0, hargaUnit: p.hargaUnit, hargaAlat: p.hargaAlat, jasa: p.jasa,
  stok: (p.stok || []).filter(x => x.itemId && x.qty > 0), garansiBulan: t.infoPaket.garansiBulan || 0, garansi: t.infoPaket.garansi || '',
};
const idAcak = () => Math.random().toString(36).slice(2, 10);

/* Nomor stiker QR: GT-0001, GT-0002, … (counters/unit). Kode hanya diberikan saat stiker dicetak/dipasang. */
const COUNTER_UNIT = () => adminDb().doc('counters/unit');
const kodesDari = (units: UnitAC[]) => units.map(u => u.kode!).filter(Boolean);

/* Unit dari baris order: pakai unitId yang dipilih, atau cocokkan label, atau buat unit baru. */
function sambungUnit(lama: UnitAC[], items: OrderItem[], intervalDefault: number, tanggal: string) {
  const units = [...lama];
  const hasil = items.map(i => {
    if (i.unitId && units.some(u => u.id === i.unitId)) return i;
    const label = i.unit.trim();
    if (!label) return { ...i, unitId: '' };
    let u = units.find(x => labelUnitLama(x).toLowerCase() === label.toLowerCase() || x.label.toLowerCase() === label.toLowerCase());
    if (!u) {
      u = { id: idAcak(), label, intervalBulan: intervalDefault || 3 };
      /* AC baru dari paket: merk, PK, tipe & garansi langsung tercatat */
      if (i.paket) Object.assign(u, {
        merk: i.paket.merk, pk: i.paket.pk, tipe: 'Split', inverter: i.paket.tipe === 'Inverter', tahun: tanggal.slice(0, 4), servisTerakhir: tanggal,
        ...(i.paket.garansiBulan ? { garansi: { sampai: tambahBulan(tanggal, i.paket.garansiBulan), ket: i.paket.garansi || '' } } : {}),
      });
      units.push(u);
    }
    return { ...i, unitId: u.id };
  });
  return { items: hasil, units: units.slice(0, 300) };
}
const labelUnitLama = (u: UnitAC) => labelUnit(u);

export async function saveOrder(id: string | null, input: OrderInput): Promise<Result> {
  return run('admin', async me => {
    const tanggal = str(input.tanggal, 10);
    if (!isDate(tanggal)) throw new UserError('Tanggal tidak valid.');
    const nama = str(input.pelanggan, 120);
    if (!nama) throw new UserError('Nama pelanggan wajib diisi.');
    const status = STATUS.includes(input.status) ? input.status : 'Terjadwal';
    const jam = str(input.jam, 5);
    if (!isTime(jam)) throw new UserError('Jam tidak valid.');
    const itemsIn = cleanItems(input.items);
    if (!itemsIn.length) throw new UserError('Isi minimal satu pekerjaan.');
    const tarif = itemsIn.some(i => i.paketId) ? bacaTarif((await adminDb().doc('settings/tarif').get()).data()) : TARIF_KOSONG;
    const teknisi = [...new Set((input.teknisi || []).map(t => str(t, 64)).filter(Boolean))].slice(0, 5);
    const hp = str(input.hp, 30), alamat = str(input.alamat, 300);
    const rawParts = (input.parts || []).slice(0, 50)
      .map(p => ({ itemId: str(p.itemId, 64), qty: r3(Math.max(0, num(p.qty))), harga: Math.max(0, num(p.harga)) }))
      .filter(p => p.itemId && p.qty > 0);

    const db = adminDb();
    const ref = id ? db.doc('orders/' + id) : db.collection('orders').doc();
    let ringkas = '';
    await db.runTransaction(async tx => {
      /* ---- baca dulu semua ---- */
      const oldSnap = id ? await tx.get(ref) : null;
      if (id && !oldSnap?.exists) throw new UserError('Order tidak ditemukan (mungkin sudah dihapus).');
      const old = oldSnap ? normOrder({ id: oldSnap.id, ...oldSnap.data() }) : null;
      const items = pasangPaket(itemsIn, tarif, old?.items || []);
      const stokSnaps = await readStok(tx, [...rawParts.map(p => p.itemId), ...items.flatMap(i => (i.paket?.stok || []).map(x => x.itemId)), ...idStok(old)]);
      const counterRef = db.doc(`counters/inv-${tanggal.slice(0, 7)}`);
      const counter = old ? null : await tx.get(counterRef);
      /* pelanggan: pakai yang dipilih, atau cari dari nomor HP, atau buat baru */
      let pRef = input.pelangganId ? db.doc('pelanggan/' + str(input.pelangganId, 64)) : null;
      let pSnap = pRef ? await tx.get(pRef) : null;
      if (!pSnap?.exists && normalHp(hp)) {
        const q = await tx.get(db.collection('pelanggan').where('hpNorm', '==', normalHp(hp)).limit(1));
        if (!q.empty) { pSnap = q.docs[0]; pRef = q.docs[0].ref; }
      }
      const pel = pSnap?.exists ? ({ id: pSnap.id, ...pSnap.data() } as Pelanggan) : null;
      /* tim hari itu: anggota tim jadi teknisi order; rute baru ditaruh paling akhir */
      const timId = str(input.timId, 64);
      const hari = timId ? await tx.get(db.doc('tim/' + tanggal)) : null;
      const tim = timId ? ((hari?.get('tim') || []) as Tim[]).find(t => t.id === timId) : undefined;
      if (timId && !tim) throw new UserError('Tim yang dipilih tidak ada di tanggal itu. Atur tim dulu.');
      const sejawat = tim && !(old && old.timId === timId && old.tanggal === tanggal)
        ? await tx.get(db.collection('orders').where('tanggal', '==', tanggal)) : null;
      const ruteBaru = sejawat ? Math.max(0, ...sejawat.docs.filter(x => x.get('timId') === timId).map(x => +x.get('rute') || 0)) + 1 : 0;

      /* ---- hitung ---- */
      /* order instansi baru: belum ditagih — nomor invoice dibuat saat admin menerbitkan invoice */
      const belumDitagih = old ? old.belumDitagih : pel?.jenis === 'Instansi';
      let invoice = old?.invoice || '', next = 0;
      if (!old && !belumDitagih) { next = (counter?.get('n') || 0) + 1; invoice = `INV/${tanggal.slice(0, 4)}/${tanggal.slice(5, 7)}/${String(next).padStart(4, '0')}`; }
      const parts: Part[] = rawParts.map(p => {
        const s = stokSnaps.get(p.itemId);
        const prev = old?.parts?.find(x => x.itemId === p.itemId);
        return { ...p, nama: s?.get('nama') || prev?.nama || '', satuan: s?.get('satuan') || prev?.satuan || '' };
      });
      const diskon = Math.max(0, num(input.diskon));
      const total = hitungTotal(items, parts, diskon);
      const pembayaran: Pembayaran[] = old ? old.pembayaran : [];
      if (!old && input.bayarAwal && METODE.includes(input.bayarAwal) && total > 0)
        pembayaran.push({ id: 'p' + Date.now().toString(36), tanggal, jumlah: total, metode: input.bayarAwal, ket: 'Bayar saat order', oleh: me.nama, at: Date.now() });
      const dibayar = jumlahBayar(pembayaran), bayar = statusBayar(total, dibayar);
      const tempo = pel?.jenis === 'Instansi' ? Math.max(0, pel.tempoHari || 0) : 0;
      const jt = str(input.jatuhTempo, 10);
      const jatuhTempo = belumDitagih ? '' : isDate(jt) ? jt : old ? '' : addDays(tanggal, tempo);

      /* ---- tulis ---- */
      const pelRef = pRef && pSnap?.exists ? pRef : db.collection('pelanggan').doc();
      /* baris order tersambung ke unit AC konsumen (unit baru dibuat tanpa stiker; stiker dipasang teknisi) */
      const sambung = sambungUnit(pel?.units || [], items, pel?.intervalBulan || 3, tanggal);
      const unitKodes = kodesDari(sambung.units);
      const unitBerubah = sambung.units.length !== (pel?.units || []).length;
      if (pel) {
        tx.update(pelRef, { units: sambung.units, unitKodes, ...(unitBerubah ? { updatedAt: Date.now() } : {}), ...(hp && !pel.hp ? { hp, hpNorm: normalHp(hp) || '' } : {}), ...(alamat && !pel.alamat ? { alamat } : {}) });
      } else {
        tx.set(pelRef, { nama, hp, hpNorm: normalHp(hp) || '', alamat, maps: '', jenis: 'Perorangan', tempoHari: 0, intervalBulan: 3, units: sambung.units, unitKodes, catatan: '', izinPengingat: true, sumber: 'Order', createdAt: Date.now(), updatedAt: Date.now() });
      }
      const doc: Omit<Order, 'id'> = {
        tanggal, jam, pelangganId: pelRef.id, pelanggan: nama, hp, alamat, teknisi: tim ? anggotaTim(tim) : teknisi,
        timId: tim ? timId : '', rute: tim ? (ruteBaru || old?.rute || 1) : 0, kendala: old?.kendala || null, pindah: old?.pindah || [],
        items: sambung.items, parts, diskon, total, status, ket: str(input.ket, 1000),
        pembayaran, dibayar, bayar, jatuhTempo,
        foto: old?.foto || [], catatanTeknisi: old?.catatanTeknisi || '', rekapId: old?.rekapId || '',
        belumDitagih, tglInvoice: old?.tglInvoice || tanggal, inv: old?.inv || {},
        invoice, createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
        paidAt: bayar === 'Lunas' ? old?.paidAt || todayWIB() : null,
      };
      if (next) tx.set(counterRef, { n: next });
      ringkas = old ? [
        old.status !== doc.status && `status ${old.status} → ${doc.status}`,
        old.total !== doc.total && `total ${rp(old.total)} → ${rp(doc.total)}`,
        old.tanggal !== doc.tanggal && `tanggal ${fmtTglR(old.tanggal)} → ${fmtTglR(doc.tanggal)}`,
        old.diskon !== doc.diskon && `potongan ${rp(old.diskon)} → ${rp(doc.diskon)}`,
      ].filter(Boolean).join('; ') : `total ${rp(doc.total)}`;
      tx.set(ref, { ...doc, fotoIds: doc.foto.map(f => f.id) }); // fotoIds: indeks untuk cek akses foto
      applyStock(tx, stokSnaps, old, { id: ref.id, ...doc });
    });
    await catat(me, id ? 'Order diubah' : 'Order dibuat', 'orders', ref.id, ringkas);
  });
}

export async function deleteOrder(id: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const old = normOrder({ id: s.id, ...s.data() });
      const stokSnaps = await readStok(tx, idStok(old));
      keSampah(tx, me, 'orders', s.id, s.data(), NAMA_DOC.orders(old));
      tx.delete(ref);
      applyStock(tx, stokSnaps, old, null);
    });
    await catat(me, 'Order dihapus (ke tempat sampah)', 'orders', str(id, 64), '', '');
  });
}

export async function setOrderStatus(id: string, status: Order['status']): Promise<Result> {
  return run('admin', async me => {
    if (!STATUS.includes(status)) throw new UserError('Status tidak dikenal.');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const old = normOrder({ id: s.id, ...s.data() });
      const stokSnaps = await readStok(tx, idStok(old));
      tx.update(ref, { status, updatedAt: Date.now() });
      applyStock(tx, stokSnaps, old, { ...old, status });
    });
    await catat(me, `Status order → ${status}`, 'orders', str(id, 64));
  });
}

/* ---------------- pembayaran (bisa berkali-kali: DP, cicil, pelunasan) ---------------- */
async function ubahPembayaran(id: string, fn: (p: Pembayaran[], o: Order) => Pembayaran[]) {
  const db = adminDb();
  const ref = db.doc('orders/' + str(id, 64));
  await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) throw new UserError('Order tidak ditemukan.');
    const o = normOrder({ id: s.id, ...s.data() });
    const pembayaran = fn([...o.pembayaran], o);
    const dibayar = jumlahBayar(pembayaran), bayar = statusBayar(o.total, dibayar);
    const lunasTgl = bayar === 'Lunas' ? (pembayaran.map(p => p.tanggal).sort().pop() || todayWIB()) : null;
    tx.update(ref, { pembayaran, dibayar, bayar, paidAt: lunasTgl, updatedAt: Date.now() });
  });
}

export async function tambahPembayaran(id: string, v: { tanggal: string; jumlah: number; metode: Metode; ket: string }): Promise<Result> {
  return run('admin', async me => {
    const tanggal = str(v.tanggal, 10), jumlah = Math.round(num(v.jumlah));
    if (!isDate(tanggal) || tanggal > todayWIB()) throw new UserError('Tanggal bayar tidak valid.');
    if (jumlah <= 0) throw new UserError('Jumlah bayar harus lebih dari 0.');
    if (!METODE.includes(v.metode)) throw new UserError('Pilih metode bayar.');
    await ubahPembayaran(id, (p, o) => {
      if (jumlah > Math.max(0, o.total - o.dibayar)) throw new UserError(`Jumlah melebihi sisa tagihan (${Math.max(0, o.total - o.dibayar).toLocaleString('id-ID')}).`);
      return [...p, { id: 'p' + Date.now().toString(36), tanggal, jumlah, metode: v.metode, ket: str(v.ket, 200), oleh: me.nama, at: Date.now() }];
    });
    await catat(me, 'Pembayaran dicatat', 'orders', str(id, 64), `${rp(jumlah)} · ${v.metode}`);
  });
}

/* hapus catatan pembayaran (salah input) — khusus pemilik */
export async function hapusPembayaran(id: string, pid: string): Promise<Result> {
  return run('owner', async me => { await ubahPembayaran(id, p => p.filter(x => x.id !== pid)); await catat(me, 'Pembayaran dihapus', 'orders', str(id, 64)); });
}

/* ---------------- penjualan langsung (sparepart / unit AC tanpa jasa) — pemilik & admin ---------------- */
export type PenjualanInput = {
  tanggal: string; pembeli: Pembeli; nama: string; hp: string; ket: string; diskon: number;
  barang: { itemId: string; qty: number; harga: number }[];
  bayar: Metode | 'Bon'; // Bon = belum dibayar (masuk piutang)
};
/* Disimpan sebagai order berstatus Selesai (jual), jadi stok, invoice/nota, piutang & omzet ikut otomatis. */
export async function simpanPenjualan(id: string | null, v: PenjualanInput): Promise<ResultOf<{ id: string }>> {
  return guarded('admin', async me => {
    const tanggal = str(v.tanggal, 10);
    if (!isDate(tanggal)) throw new UserError('Tanggal tidak valid.');
    const pembeli: Pembeli = v.pembeli in PEMBELI ? v.pembeli : 'konsumen';
    const nama = str(v.nama, 120), hp = str(v.hp, 30);
    const bon = v.bayar === 'Bon';
    if (bon && (!nama || !normalHp(hp))) throw new UserError('Penjualan bon wajib diisi nama & nomor HP pembeli supaya bisa ditagih.');
    const raw = (v.barang || []).slice(0, 50)
      .map(b => ({ itemId: str(b.itemId, 64), qty: r3(Math.max(0, num(b.qty))), harga: Math.max(0, num(b.harga)) }))
      .filter(b => b.itemId && b.qty > 0);
    if (!raw.length) throw new UserError('Pilih minimal satu barang.');
    const db = adminDb();
    const ref = id ? db.doc('orders/' + str(id, 64)) : db.collection('orders').doc();
    await db.runTransaction(async tx => {
      const oldSnap = id ? await tx.get(ref) : null;
      if (id && !oldSnap?.exists) throw new UserError('Penjualan tidak ditemukan.');
      const old = oldSnap ? normOrder({ id: oldSnap.id, ...oldSnap.data() }) : null;
      if (old && !old.jual) throw new UserError('Data ini bukan penjualan langsung.');
      const stokSnaps = await readStok(tx, [...raw.map(b => b.itemId), ...idStok(old)]);
      const counterRef = db.doc(`counters/inv-${tanggal.slice(0, 7)}`);
      const counter = old ? null : await tx.get(counterRef);
      /* nomor HP cocok dengan pelanggan terdaftar → tersambung ke data pelanggan */
      const q = normalHp(hp) ? await tx.get(db.collection('pelanggan').where('hpNorm', '==', normalHp(hp)).limit(1)) : null;
      const parts: Part[] = raw.map(b => {
        const s = stokSnaps.get(b.itemId);
        if (!s?.exists) throw new UserError('Ada barang yang sudah dihapus dari stok. Muat ulang halaman.');
        return { ...b, nama: s.get('nama') || '', satuan: s.get('satuan') || '' };
      });
      const diskon = Math.max(0, num(v.diskon));
      const total = hitungTotal([], parts, diskon);
      let pembayaran: Pembayaran[] = old ? old.pembayaran : [];
      if (!old && !bon && total > 0) {
        const metode = METODE.includes(v.bayar as Metode) ? (v.bayar as Metode) : 'Tunai';
        pembayaran = [{ id: 'p' + Date.now().toString(36), tanggal, jumlah: total, metode, ket: 'Bayar langsung', oleh: me.nama, at: Date.now() }];
      }
      const dibayar = jumlahBayar(pembayaran), bayar = statusBayar(total, dibayar);
      const next = old ? 0 : (counter?.get('n') || 0) + 1;
      const doc: Omit<Order, 'id'> = {
        tanggal, jam: old?.jam || nowTimeWIB(), pelangganId: q && !q.empty ? q.docs[0].id : '', pelanggan: nama || (pembeli === 'mitra' ? 'Mitra' : 'Konsumen umum'), hp, alamat: '',
        teknisi: [], items: [], parts, diskon, total, status: 'Selesai', ket: str(v.ket, 500),
        pembayaran, dibayar, bayar, jatuhTempo: old ? old.jatuhTempo : '',
        foto: [], catatanTeknisi: '', rekapId: '', belumDitagih: false, tglInvoice: old?.tglInvoice || tanggal, inv: old?.inv || {},
        jual: { pembeli },
        invoice: old?.invoice || `INV/${tanggal.slice(0, 4)}/${tanggal.slice(5, 7)}/${String(next).padStart(4, '0')}`,
        createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(), paidAt: bayar === 'Lunas' ? old?.paidAt || tanggal : null,
      };
      if (next) tx.set(counterRef, { n: next });
      tx.set(ref, { ...doc, fotoIds: [] });
      applyStock(tx, stokSnaps, old, { id: ref.id, ...doc });
    });
    await catat(me, id ? 'Penjualan langsung diubah' : 'Penjualan langsung dibuat', 'orders', ref.id);
    return { id: ref.id };
  });
}

/* ---------------- daftar harga (layanan & paket AC baru) — pemilik & admin ---------------- */
const nonNeg = (v: unknown) => Math.max(0, Math.round(num(v)));
function bacaTarif(raw: unknown): Tarif {
  const t = (raw || {}) as Partial<Tarif>;
  const jenis = (j: unknown) => (j as string) in JENIS_HARGA ? (j as TarifLayanan['jenis']) : 'manual';
  return {
    layanan: (Array.isArray(t.layanan) ? t.layanan : []).slice(0, 100).map(l => ({
      id: str(l?.id, 40) || idAcak(), nama: str(l?.nama, 120), jenis: jenis(l?.jenis),
      harga1: nonNeg(l?.harga1), harga2: nonNeg(l?.harga2), inverter: nonNeg(l?.inverter), harga: nonNeg(l?.harga), ket: str(l?.ket, 1000),
    })).filter(l => l.nama),
    paket: (Array.isArray(t.paket) ? t.paket : []).slice(0, 200).map(p => ({
      id: str(p?.id, 40) || idAcak(), merk: str(p?.merk, 40), pk: str(p?.pk, 10), tipe: p?.tipe === 'Inverter' ? 'Inverter' as const : 'Standard' as const,
      watt: nonNeg(p?.watt), hargaUnit: nonNeg(p?.hargaUnit), hargaAlat: nonNeg(p?.hargaAlat), jasa: nonNeg(p?.jasa),
      stok: (Array.isArray(p?.stok) ? p.stok : []).slice(0, 20).map(x => ({ itemId: str(x?.itemId, 64), qty: r3(Math.max(0, num(x?.qty))) })).filter(x => x.itemId && x.qty > 0),
      nonaktif: !!p?.nonaktif,
    })).filter(p => p.merk),
    infoPaket: { garansi: str(t.infoPaket?.garansi, 300), garansiBulan: Math.min(240, nonNeg(t.infoPaket?.garansiBulan)), alatStandar: str(t.infoPaket?.alatStandar, 600) },
  };
}

export async function saveTarif(t: Tarif): Promise<Result> {
  return run('admin', async me => {
    await adminDb().doc('settings/tarif').set({ ...bacaTarif(t), diubah: { oleh: me.nama, at: Date.now() } });
    await catat(me, 'Daftar harga diubah', '', '', '', 'Daftar harga');
  });
}

/* ---------------- invoice: terbitkan & ubah isian ---------------- */
/* Terbitkan invoice untuk order yang belum ditagih (instansi): nomor invoice dibuat menurut bulan tanggal invoice.
   jatuhTempo '' = tempo belum pasti. */
export async function terbitkanInvoice(id: string, tglInvoice: string, jatuhTempo: string): Promise<ResultOf<{ invoice: string }>> {
  return guarded('admin', async me => {
    const tgl = str(tglInvoice, 10), jt = str(jatuhTempo, 10);
    if (!isDate(tgl)) throw new UserError('Tanggal invoice tidak valid.');
    if (jt && (!isDate(jt) || jt < tgl)) throw new UserError('Jatuh tempo tidak valid (harus sesudah tanggal invoice).');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    const hasil = await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const o = normOrder({ id: s.id, ...s.data() });
      if (o.status === 'Batal') throw new UserError('Order ini sudah dibatalkan.');
      if (!o.belumDitagih) throw new UserError('Invoice order ini sudah diterbitkan.');
      const counterRef = db.doc(`counters/inv-${tgl.slice(0, 7)}`);
      const n = ((await tx.get(counterRef)).get('n') || 0) + 1;
      const invoice = `INV/${tgl.slice(0, 4)}/${tgl.slice(5, 7)}/${String(n).padStart(4, '0')}`;
      tx.set(counterRef, { n });
      tx.update(ref, { invoice, belumDitagih: false, tglInvoice: tgl, jatuhTempo: jt, updatedAt: Date.now() });
      return { invoice };
    });
    await catat(me, 'Invoice diterbitkan', 'orders', str(id, 64), hasil.invoice);
    return hasil;
  });
}

export type InfoInvoiceInput = { model: string; kepada: string; perihal: string; noRef: string; catatan: string; tglInvoice: string; jatuhTempo: string };
/* Ubah isian invoice (Kepada Yth., perihal, no. referensi, catatan, model kop, tanggal, jatuh tempo).
   Nomor invoice tetap. Invoice yang sudah lunas hanya bisa diubah pemilik. Setiap perubahan dicatat. */
export async function simpanInfoInvoice(id: string, v: InfoInvoiceInput): Promise<Result> {
  return run('admin', async me => {
    const tgl = str(v.tglInvoice, 10), jt = str(v.jatuhTempo, 10);
    if (tgl && !isDate(tgl)) throw new UserError('Tanggal invoice tidak valid.');
    if (jt && !isDate(jt)) throw new UserError('Jatuh tempo tidak valid.');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const o = normOrder({ id: s.id, ...s.data() });
      if (o.bayar === 'Lunas' && me.peran !== 'owner') throw new UserError('Invoice yang sudah lunas hanya bisa diubah pemilik.');
      const inv = {
        model: MODEL_INVOICE.includes(v.model as never) ? v.model : '', kepada: str(v.kepada, 300), perihal: str(v.perihal, 200),
        noRef: str(v.noRef, 80), catatan: str(v.catatan, 1000), diubah: [...(o.inv.diubah || []), { oleh: me.nama, at: Date.now() }].slice(-20),
      };
      tx.update(ref, { inv, ...(tgl && !o.belumDitagih ? { tglInvoice: tgl } : {}), ...(!o.belumDitagih ? { jatuhTempo: jt } : {}), updatedAt: Date.now() });
    });
    await catat(me, 'Isian invoice diubah', 'orders', str(id, 64));
  });
}

/* ---------------- tim harian & rute ---------------- */
/* simpan susunan tim satu tanggal; order tim itu ikut diperbarui anggotanya */
export async function simpanTim(tanggal: string, tim: Tim[]): Promise<Result> {
  return run('admin', async me => {
    const tgl = str(tanggal, 10);
    if (!isDate(tgl)) throw new UserError('Tanggal tidak valid.');
    const db = adminDb();
    const kar = new Set((await db.collection('karyawan').get()).docs.filter(d => !d.get('nonaktif')).map(d => d.id));
    const dipakai = new Set<string>();
    const bersih: Tim[] = (tim || []).slice(0, 20).map(t => {
      const ketua = str(t.ketua, 64);
      if (!kar.has(ketua)) throw new UserError('Teknisi tim tidak ditemukan / nonaktif.');
      const anggota = [...new Set((t.anggota || []).map(a => str(a, 64)))].filter(a => kar.has(a) && a !== ketua).slice(0, 6);
      for (const id of [ketua, ...anggota]) { if (dipakai.has(id)) throw new UserError('Satu orang hanya boleh ada di satu tim per hari.'); dipakai.add(id); }
      return { id: ketua, ketua, anggota, bisaBantu: !!t.bisaBantu };
    });
    await db.runTransaction(async tx => {
      const os = await tx.get(db.collection('orders').where('tanggal', '==', tgl));
      tx.set(db.doc('tim/' + tgl), { tanggal: tgl, tim: bersih });
      for (const o of os.docs) {
        const tid = o.get('timId');
        if (!tid) continue;
        const t = bersih.find(x => x.id === tid);
        tx.update(o.ref, t ? { teknisi: anggotaTim(t), updatedAt: Date.now() } : { timId: '', rute: 0, updatedAt: Date.now() });
      }
    });
    await catat(me, 'Susunan tim disimpan', 'tim', tgl);
  });
}

/* pindahkan order ke tim (atau lepas dari tim) dan taruh di urutan ke-`posisi` (0 = paling atas); nomor rute diurutkan ulang */
export async function aturRute(orderId: string, timId: string, posisi: number): Promise<Result> {
  return run('admin', async me => {
    const db = adminDb();
    const ref = db.doc('orders/' + str(orderId, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const o = normOrder({ id: s.id, ...s.data() });
      const ke = str(timId, 64);
      const hari = await tx.get(db.doc('tim/' + o.tanggal));
      const tim = ((hari.get('tim') || []) as Tim[]).find(t => t.id === ke);
      if (ke && !tim) throw new UserError('Tim tujuan tidak ada di tanggal ini.');
      const semua = (await tx.get(db.collection('orders').where('tanggal', '==', o.tanggal))).docs
        .map(x => normOrder({ id: x.id, ...x.data() })).filter(x => x.id !== o.id && x.status !== 'Batal' && !x.jual);
      const nama = async (id: string) => id ? ((await tx.get(db.doc('karyawan/' + id))).get('nama') || '') : '';
      const dari = o.timId || '';
      const [namaDari, namaKe] = dari !== ke ? [await nama(dari), await nama(ke)] : ['', ''];
      /* urutan baru tim tujuan */
      const tujuan = semua.filter(x => x.timId === ke).sort((a, b) => (a.rute || 999) - (b.rute || 999));
      tujuan.splice(Math.max(0, Math.min(tujuan.length, Math.round(num(posisi)))), 0, o);
      tujuan.forEach((x, i) => {
        if (x.id === o.id) return;
        if (x.rute !== i + 1) tx.update(db.doc('orders/' + x.id), { rute: i + 1 });
      });
      const idx = tujuan.findIndex(x => x.id === o.id);
      tx.update(ref, {
        timId: ke, rute: ke ? idx + 1 : 0, teknisi: tim ? anggotaTim(tim) : o.teknisi, updatedAt: Date.now(),
        ...(dari !== ke ? {
          kendala: null,
          pindah: [...(o.pindah || []), { dari: namaDari ? 'Tim ' + namaDari : 'Tanpa tim', ke: namaKe ? 'Tim ' + namaKe : 'Tanpa tim', oleh: me.nama, at: Date.now(), alasan: o.kendala?.alasan || '' }].slice(-20),
        } : {}),
      });
      /* rapikan nomor rute tim asal */
      if (dari && dari !== ke) semua.filter(x => x.timId === dari).sort((a, b) => (a.rute || 999) - (b.rute || 999))
        .forEach((x, i) => { if (x.rute !== i + 1) tx.update(db.doc('orders/' + x.id), { rute: i + 1 }); });
    });
    await catat(me, 'Rute diatur / dipindah', 'orders', str(orderId, 64));
  });
}

/* jadwal ulang ke tanggal lain (lepas dari tim; riwayat tercatat) */
export async function jadwalUlang(orderId: string, tanggal: string): Promise<Result> {
  return run('admin', async me => {
    const tgl = str(tanggal, 10);
    if (!isDate(tgl)) throw new UserError('Tanggal tidak valid.');
    const ref = adminDb().doc('orders/' + str(orderId, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Order tidak ditemukan.');
    const o = normOrder({ id: s.id, ...s.data() });
    await ref.update({
      tanggal: tgl, timId: '', rute: 0, kendala: null, status: 'Terjadwal', updatedAt: Date.now(),
      pindah: [...(o.pindah || []), { dari: fmtTgl(o.tanggal), ke: fmtTgl(tgl), oleh: me.nama, at: Date.now(), alasan: o.kendala?.alasan || 'Jadwal ulang' }].slice(-20),
    });
    await catat(me, 'Jadwal ulang', 'orders', str(orderId, 64), `ke ${fmtTglR(tgl)}`);
  });
}
const fmtTgl = (t: string) => new Date(t + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* tim lapangan melaporkan kendala (alasan kosong = batalkan laporan) */
export async function laporKendala(orderId: string, alasan: string): Promise<Result> {
  return run('karyawan', async me => {
    const ref = adminDb().doc('orders/' + str(orderId, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Order tidak ditemukan.');
    bolehOrder(me, normOrder({ id: s.id, ...s.data() }));
    const a = str(alasan, 200);
    await ref.update({ kendala: a ? { alasan: a, oleh: me.nama, at: Date.now() } : null, updatedAt: Date.now() });
  });
}

/* tim memberi tanda siap menerima rute dari tim lain */
export async function tandaBisaBantu(tanggal: string, bisa: boolean): Promise<Result> {
  return run('karyawan', async me => {
    const ref = adminDb().doc('tim/' + str(tanggal, 10));
    await adminDb().runTransaction(async tx => {
      const s = await tx.get(ref);
      const tim = (s.get('tim') || []) as Tim[];
      const t = tim.find(x => me.karyawanId && anggotaTim(x).includes(me.karyawanId));
      if (!t && me.peran === 'karyawan') throw new UserError('Anda belum masuk tim hari ini.');
      if (!t) return;
      tx.update(ref, { tim: tim.map(x => (x.id === t.id ? { ...x, bisaBantu: !!bisa } : x)) });
    });
  });
}

/* pesan cepat WA teknisi → konsumen (diatur admin) */
export async function savePesanCepat(list: { judul: string; teks: string }[]): Promise<Result> {
  return run('admin', async () => {
    const bersih = (list || []).slice(0, 8).map(x => ({ judul: str(x.judul, 40), teks: str(x.teks, 600) })).filter(x => x.judul && x.teks);
    await adminDb().doc('settings/usaha').set({ pesanCepat: bersih.length ? bersih : PESAN_CEPAT }, { merge: true });
  });
}

/* ---------------- teknisi di lapangan ---------------- */
/* karyawan hanya boleh mengubah order yang ia ikut tangani; admin/pemilik semua order */
function bolehOrder(me: Me, o: Order) {
  if (me.peran === 'karyawan' && !(me.karyawanId && o.teknisi.includes(me.karyawanId))) throw new UserError('Order ini bukan tugas Anda.');
}
const STATUS_TEKNISI: Status[] = ['Dikerjakan', 'Selesai', 'Jadwal ulang'];

export async function teknisiStatus(id: string, status: Status): Promise<Result> {
  return run('karyawan', async me => {
    if (!STATUS_TEKNISI.includes(status)) throw new UserError('Status tidak diizinkan.');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const old = normOrder({ id: s.id, ...s.data() });
      bolehOrder(me, old);
      if (old.status === 'Batal') throw new UserError('Order ini sudah dibatalkan admin.');
      const stokSnaps = await readStok(tx, idStok(old));
      tx.update(ref, { status, updatedAt: Date.now() });
      applyStock(tx, stokSnaps, old, { ...old, status });
    });
  });
}

/* Laporan teknisi: tambah pekerjaan (harga dari tarif), tambah sparepart (harga jual stok), catatan.
   Harga ditentukan server — teknisi tidak melihat/mengisi harga. */
export async function teknisiLapor(id: string, v: { items: { layanan: string; unit: string; qty: number; unitId?: string }[]; parts: { itemId: string; qty: number }[]; catatan: string }): Promise<Result> {
  return run('karyawan', async me => {
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    const tarif = bacaTarif((await db.doc('settings/tarif').get()).data());
    const addItems = (v.items || []).slice(0, 10).map(i => ({ layanan: str(i.layanan, 120), unit: str(i.unit, 160), qty: Math.max(1, Math.round(num(i.qty)) || 1), unitId: str(i.unitId, 20) })).filter(i => i.layanan);
    const addParts = (v.parts || []).slice(0, 20).map(p => ({ itemId: str(p.itemId, 64), qty: r3(Math.max(0, num(p.qty))) })).filter(p => p.itemId && p.qty > 0);
    const catatan = str(v.catatan, 1000);
    if (!addItems.length && !addParts.length && !catatan) throw new UserError('Belum ada yang diisi.');
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Order tidak ditemukan.');
      const old = normOrder({ id: s.id, ...s.data() });
      bolehOrder(me, old);
      if (old.status === 'Batal') throw new UserError('Order ini sudah dibatalkan admin.');
      /* tambah pekerjaan & sparepart hanya ketua tim (teknisi); helper cukup catatan */
      if (me.peran === 'karyawan' && (addItems.length || addParts.length)) {
        const tim = old.timId ? ((await tx.get(db.doc('tim/' + old.tanggal))).get('tim') as Tim[] | undefined)?.find(t => t.id === old.timId) : undefined;
        const k = me.karyawanId ? await tx.get(db.doc('karyawan/' + me.karyawanId)) : null;
        const ketua = tim ? tim.ketua === me.karyawanId : !!k && posisiKaryawan({ posisi: k.get('posisi'), peran: k.get('peran') || '', akun: k.get('akun') }) === 'teknisi';
        if (!ketua) throw new UserError('Tambah pekerjaan & sparepart dilakukan teknisi tim. Helper cukup kirim catatan.');
      }
      const stokSnaps = await readStok(tx, [...idStok(old), ...addParts.map(p => p.itemId)]);
      /* harga dari daftar harga + PK/tipe unit yang dipilih; kalau tidak bisa otomatis, ditandai untuk diisi admin */
      const pSnap = old.pelangganId ? await tx.get(db.doc('pelanggan/' + old.pelangganId)) : null;
      const unitsPel = (pSnap?.get('units') || []) as UnitAC[];
      const items: OrderItem[] = [...old.items, ...addItems.map(i => {
        const u = unitsPel.find(x => x.id === i.unitId);
        const h = hargaOtomatis(tarif.layanan.find(t => t.nama === i.layanan), u);
        return { layanan: i.layanan, unit: u ? labelUnit(u) : i.unit, qty: i.qty, harga: h.harga || 0, ...(u ? { unitId: u.id } : {}), ...(h.harga == null ? { perluHarga: true } : {}) };
      })];
      const parts: Part[] = old.parts.map(p => ({ ...p }));
      for (const p of addParts) {
        const sn = stokSnaps.get(p.itemId);
        if (!sn?.exists) throw new UserError('Barang stok tidak ditemukan.');
        const ada = parts.find(x => x.itemId === p.itemId);
        if (ada) ada.qty = r3(ada.qty + p.qty);
        else parts.push({ itemId: p.itemId, qty: p.qty, harga: +sn.get('hargaJual') || 0, nama: sn.get('nama') || '', satuan: sn.get('satuan') || '' });
      }
      const total = hitungTotal(items, parts, old.diskon);
      const bayar = statusBayar(total, old.dibayar);
      const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
      const catatanTeknisi = catatan ? [old.catatanTeknisi, `[${waktu} · ${me.nama}] ${catatan}`].filter(Boolean).join('\n') : old.catatanTeknisi;
      const neu = { ...old, items, parts, total, bayar, catatanTeknisi };
      tx.update(ref, { items, parts, total, bayar, paidAt: bayar === 'Lunas' ? old.paidAt || todayWIB() : null, catatanTeknisi, updatedAt: Date.now() });
      applyStock(tx, stokSnaps, old, neu);
    });
  });
}

/* ---------------- foto bukti kerja (Google Drive) ---------------- */
export async function kirimFoto(id: string, jenis: Foto['jenis'], base64: string): Promise<Result> {
  return run('karyawan', async me => {
    if (!JENIS_FOTO.includes(jenis)) throw new UserError('Jenis foto tidak dikenal.');
    const jpeg = Buffer.from(String(base64 || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    if (jpeg.length < 1000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new UserError('File foto tidak valid.');
    if (jpeg.length > 2_500_000) throw new UserError('Foto terlalu besar.');
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Order tidak ditemukan.');
    const o = normOrder({ id: s.id, ...s.data() });
    bolehOrder(me, o);
    if (o.foto.length >= 30) throw new UserError('Maksimal 30 foto per order.');
    let fileId: string;
    try {
      const jam = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/:/g, '');
      fileId = await uploadFoto(`${(o.invoice || o.id).replace(/\//g, '-')} ${o.pelanggan.slice(0, 40)} ${jenis} ${todayWIB()} ${jam}.jpg`, todayWIB().slice(0, 7), jpeg);
    } catch (e) {
      console.error(e);
      const m = e instanceof Error ? e.message : '';
      throw new UserError(m === 'FOTO_BELUM_AKTIF' ? 'Penyimpanan foto belum disambungkan pemilik (Pengaturan → Foto).' : 'Upload foto gagal. Coba lagi.');
    }
    const foto: Foto = { id: fileId, jenis, oleh: me.nama, olehUid: me.uid, at: Date.now() };
    await ref.update({ foto: FieldValue.arrayUnion(foto), fotoIds: FieldValue.arrayUnion(fileId), updatedAt: Date.now() });
  });
}

/* hapus foto: pengunggahnya (hari yang sama) atau admin/pemilik */
export async function hapusFoto(id: string, fotoId: string): Promise<Result> {
  return run('karyawan', async me => {
    const db = adminDb();
    const ref = db.doc('orders/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Order tidak ditemukan.');
    const o = normOrder({ id: s.id, ...s.data() });
    const f = o.foto.find(x => x.id === fotoId);
    if (!f) return;
    const sendiri = f.olehUid === me.uid && Date.now() - f.at < 24 * 3600_000;
    if (!atLeast(me.peran, 'admin') && !sendiri) throw new UserError('Foto hanya bisa dihapus pengunggahnya (hari yang sama) atau admin.');
    try { await buangFoto(fotoId); } catch (e) { console.error(e); }
    await ref.update({ foto: o.foto.filter(x => x.id !== fotoId), fotoIds: FieldValue.arrayRemove(fotoId), updatedAt: Date.now() });
  });
}

/* pemilik menyambungkan skrip foto (URL web app Google Apps Script yang berakhiran /exec) */
export async function setDriveFoto(link: string): Promise<ResultOf<{ nama: string }>> {
  return guarded('owner', async () => {
    const url = String(link || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
      throw new UserError('Tempel URL Web app dari Apps Script (diawali https://script.google.com/macros/s/ dan berakhiran /exec).');
    try {
      const folder = await sambungSkrip(url);
      return { nama: folder ? 'folder Foto di Drive Anda' : 'Drive Anda' };
    } catch (e) {
      console.error(e);
      const m = e instanceof Error ? e.message : '';
      throw new UserError(/unauthorized/.test(m) ? 'Kata sandi di skrip tidak cocok. Salin ulang kode skrip dari panduan.' : 'Skrip tidak bisa dipanggil. Pastikan sudah Deploy sebagai Web app dengan "Execute as: Me" dan "Who has access: Anyone".');
    }
  });
}

/* ---------------- invoice gabungan bulanan (instansi) ---------------- */
export async function buatRekap(pelangganId: string, bulan: string, orderIds: string[], jatuhTempo: string): Promise<ResultOf<{ id: string }>> {
  return guarded('admin', async me => {
    if (!/^\d{4}-\d{2}$/.test(bulan)) throw new UserError('Bulan tidak valid.');
    if (jatuhTempo && !isDate(jatuhTempo)) throw new UserError('Jatuh tempo tidak valid.');
    const ids = [...new Set((orderIds || []).map(x => str(x, 64)).filter(Boolean))].slice(0, 200);
    if (!ids.length) throw new UserError('Pilih minimal satu order.');
    const db = adminDb();
    const ref = db.collection('rekap').doc();
    await db.runTransaction(async tx => {
      const pSnap = await tx.get(db.doc('pelanggan/' + str(pelangganId, 64)));
      if (!pSnap.exists) throw new UserError('Pelanggan tidak ditemukan.');
      const snaps = await tx.getAll(...ids.map(id => db.doc('orders/' + id)));
      const counterRef = db.doc(`counters/rek-${todayWIB().slice(0, 7)}`);
      const c = await tx.get(counterRef);
      for (const s of snaps) {
        if (!s.exists) throw new UserError('Ada order yang sudah dihapus. Muat ulang lalu coba lagi.');
        const o = normOrder({ id: s.id, ...s.data() });
        const nm = o.invoice || `tanggal ${o.tanggal}`;
        if (o.pelangganId !== pSnap.id) throw new UserError(`Order ${nm} bukan milik pelanggan ini.`);
        if (o.rekapId) throw new UserError(`Order ${nm} sudah masuk rekap lain.`);
        if (o.status === 'Batal') throw new UserError(`Order ${nm} sudah dibatalkan.`);
      }
      const n = (c.get('n') || 0) + 1;
      const nomor = `REK/${todayWIB().slice(0, 4)}/${todayWIB().slice(5, 7)}/${String(n).padStart(4, '0')}`;
      tx.set(counterRef, { n });
      tx.set(ref, { nomor, pelangganId: pSnap.id, pelanggan: pSnap.get('nama'), bulan, orderIds: ids, tanggal: todayWIB(), jatuhTempo, createdAt: Date.now(), oleh: me.nama });
      /* order yang belum ditagih ikut tertagih lewat rekap ini */
      for (const s of snaps) tx.update(s.ref, { rekapId: ref.id, jatuhTempo, ...(s.get('belumDitagih') ? { belumDitagih: false, tglInvoice: todayWIB() } : {}), updatedAt: Date.now() });
    });
    await catat(me, 'Tagihan gabungan dibuat', 'rekap', ref.id);
    return { id: ref.id };
  });
}

/* pembayaran di tingkat rekap → dibagi ke order-order di dalamnya (yang paling lama dulu) */
export async function bayarRekap(rekapId: string, v: { tanggal: string; jumlah: number; metode: Metode; ket: string }): Promise<Result> {
  return run('admin', async me => {
    const tanggal = str(v.tanggal, 10), jumlah = Math.round(num(v.jumlah));
    if (!isDate(tanggal) || tanggal > todayWIB()) throw new UserError('Tanggal bayar tidak valid.');
    if (jumlah <= 0) throw new UserError('Jumlah bayar harus lebih dari 0.');
    if (!METODE.includes(v.metode)) throw new UserError('Pilih metode bayar.');
    const db = adminDb();
    await db.runTransaction(async tx => {
      const r = await tx.get(db.doc('rekap/' + str(rekapId, 64)));
      if (!r.exists) throw new UserError('Rekap tidak ditemukan.');
      const snaps = await tx.getAll(...((r.get('orderIds') || []) as string[]).map(id => db.doc('orders/' + id)));
      const orders = snaps.filter(s => s.exists).map(s => normOrder({ id: s.id, ...s.data() }));
      const { hasil, lebih } = alokasiBayar(orders, jumlah);
      if (lebih > 0) throw new UserError(`Jumlah melebihi sisa tagihan rekap sebesar ${lebih.toLocaleString('id-ID')}.`);
      for (const h of hasil) {
        const o = orders.find(x => x.id === h.orderId)!;
        const pembayaran = [...o.pembayaran, { id: 'p' + Date.now().toString(36) + h.orderId.slice(0, 4), tanggal, jumlah: h.jumlah, metode: v.metode, ket: [`via ${r.get('nomor')}`, str(v.ket, 200)].filter(Boolean).join(' · '), oleh: me.nama, at: Date.now() }];
        const dibayar = jumlahBayar(pembayaran), bayar = statusBayar(o.total, dibayar);
        tx.update(db.doc('orders/' + o.id), { pembayaran, dibayar, bayar, paidAt: bayar === 'Lunas' ? tanggal : null, updatedAt: Date.now() });
      }
    });
    await catat(me, 'Pembayaran tagihan gabungan', 'rekap', str(rekapId, 64), rp(jumlah));
  });
}

/* batalkan rekap (khusus pemilik): order kembali ditagih sendiri-sendiri; pembayaran yang sudah ada tetap */
export async function batalRekap(rekapId: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    await db.runTransaction(async tx => {
      const ref = db.doc('rekap/' + str(rekapId, 64));
      const r = await tx.get(ref);
      if (!r.exists) return;
      const snaps = await tx.getAll(...((r.get('orderIds') || []) as string[]).map(id => db.doc('orders/' + id)));
      for (const s of snaps) if (s.exists && s.get('rekapId') === r.id) tx.update(s.ref, { rekapId: '', updatedAt: Date.now() });
      tx.delete(ref);
    });
    await catat(me, 'Tagihan gabungan dibatalkan', 'rekap', str(rekapId, 64));
  });
}

/* pengingat servis: tandai pelanggan sudah dihubungi (disembunyikan dari daftar ±14 hari) */
/* Hasil follow-up pengingat cuci AC:
   Mau → (buat order) muncul lagi 14 hari kalau belum dijadwalkan · Nanti → 14 hari · Tidak → satu siklus lagi · Nomor salah → pengingat dimatikan */
export async function catatPengingat(pelangganId: string, hasil: Pengingat['hasil']): Promise<Result> {
  return run('admin', async me => {
    if (!HASIL_PENGINGAT.includes(hasil)) throw new UserError('Hasil tidak dikenal.');
    const ref = adminDb().doc('pelanggan/' + str(pelangganId, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Pelanggan tidak ditemukan.');
    const t = todayWIB();
    const ulang = hasil === 'Tidak' ? tambahBulan(t, +s.get('intervalBulan') || 3) : hasil === 'Nomor salah' ? '9999-12-31' : addDays(t, 14);
    await ref.update({ pengingat: { hasil, tanggal: t, ulang, oleh: me.nama }, ...(hasil === 'Nomor salah' ? { izinPengingat: false } : {}) });
  });
}

/* ---------------- pelanggan ---------------- */
type PelangganInput = Omit<Pelanggan, 'id' | 'createdAt' | 'pengingat' | 'baru' | 'diingatkan' | 'updatedAt'> & { versi?: number };
const cleanRiwayat = (r: unknown): RiwayatUnit[] => (Array.isArray(r) ? r : []).slice(-20).map((x: RiwayatUnit) => ({
  merk: str(x?.merk, 40), pk: str(x?.pk, 10), tipe: str(x?.tipe, 20), freon: str(x?.freon, 12), tahun: str(x?.tahun, 4),
  sampai: isDate(str(x?.sampai, 10)) ? str(x?.sampai, 10) : todayWIB(), ket: str(x?.ket, 200), oleh: str(x?.oleh, 80),
}));
/* bersihkan isian unit dari browser; kode stiker, foto & jejak pencatat diambil dari data server (tidak bisa diubah lewat form) */
const cleanUnit = (u: UnitAC, intervalDefault: number, lama?: UnitAC): UnitAC => ({
  id: lama?.id || idAcak(), ...(lama?.kode ? { kode: lama.kode } : {}),
  label: str(u.label, 120), gedung: str(u.gedung, 60), noAc: str(u.noAc, 20),
  merk: str(u.merk, 40), pk: str(u.pk, 10), tipe: str(u.tipe, 20), freon: str(u.freon, 12), tahun: str(u.tahun, 4),
  servisTerakhir: isDate(str(u.servisTerakhir, 10)) ? str(u.servisTerakhir, 10) : '', perkiraan: !!u.perkiraan,
  intervalBulan: Math.min(24, Math.max(1, Math.round(num(u.intervalBulan)) || intervalDefault || 3)),
  catatan: str(u.catatan, 500), nonaktif: !!u.nonaktif, riwayat: cleanRiwayat(u.riwayat), inverter: !!u.inverter,
  ...(isDate(str(u.garansi?.sampai, 10)) ? { garansi: { sampai: str(u.garansi?.sampai, 10), ket: str(u.garansi?.ket, 300) } } : {}),
  ...(lama?.fotoIndoor ? { fotoIndoor: lama.fotoIndoor } : {}), ...(lama?.fotoOutdoor ? { fotoOutdoor: lama.fotoOutdoor } : {}),
  ...(lama?.dicatat ? { dicatat: lama.dicatat } : {}),
});
/* daftar gedung: unik (tanpa beda huruf besar/kecil), ditambah gedung yang dipakai unit */
function rapikanGedung(daftar: string[], units: UnitAC[]) {
  const hasil: string[] = [];
  for (const g of [...(daftar || []), ...units.map(u => u.gedung || '')]) {
    const n = str(g, 60);
    if (n && !hasil.some(x => x.toLowerCase() === n.toLowerCase())) hasil.push(n);
  }
  return hasil.slice(0, 80);
}
const BENTROK = 'Data konsumen ini baru saja diubah orang lain (mis. teknisi di lapangan). Tutup jendela ini, buka lagi, lalu ulangi perubahan Anda.';

export async function savePelanggan(id: string | null, v: PelangganInput): Promise<ResultOf<{ id: string }>> {
  return guarded('admin', async me => {
    const nama = str(v.nama, 120);
    if (!nama) throw new UserError('Nama pelanggan wajib diisi.');
    const hp = str(v.hp, 30);
    const intervalBulan = Math.min(24, Math.max(1, Math.round(num(v.intervalBulan)) || 3));
    const db = adminDb();
    const ref = id ? db.doc('pelanggan/' + str(id, 64)) : db.collection('pelanggan').doc();
    await db.runTransaction(async tx => {
      const snap = id ? await tx.get(ref) : null;
      if (id && !snap?.exists) throw new UserError('Pelanggan tidak ditemukan.');
      if (snap && (snap.get('updatedAt') || 0) > (num(v.versi) || 0)) throw new UserError(BENTROK);
      const lama = new Map(((snap?.get('units') || []) as UnitAC[]).map(u => [u.id, u]));
      const units = (v.units || []).slice(0, 300)
        .map(u => cleanUnit(u, intervalBulan, lama.get(str(u.id, 20))))
        .filter(u => u.label || u.merk || u.kode);
      const dihapus = [...lama.values()].filter(u => !units.some(x => x.id === u.id));
      if (dihapus.length && me.peran !== 'owner') throw new UserError('Hanya pemilik yang bisa menghapus unit AC. Gunakan "Tidak aktif" untuk AC yang dibongkar.');
      /* unit dihapus (salah input): stikernya kembali kosong dan bisa dipasang ulang */
      for (const u of dihapus) if (u.kode) tx.set(db.doc('stiker/' + u.kode), { status: 'kosong', pelangganId: FieldValue.delete(), unitId: FieldValue.delete() }, { merge: true });
      const doc = {
        nama, hp, hpNorm: normalHp(hp) || '', alamat: str(v.alamat, 300), maps: str(v.maps, 500), patokan: str(v.patokan, 200),
        jenis: JENIS_PELANGGAN.includes(v.jenis) ? v.jenis : 'Perorangan',
        tipeLokasi: TIPE_LOKASI.includes(v.tipeLokasi as never) ? v.tipeLokasi : 'Rumah', sumber: str(v.sumber, 60),
        tempoHari: Math.min(365, Math.max(0, Math.round(num(v.tempoHari)))), intervalBulan,
        izinPengingat: v.izinPengingat !== false,
        rekening: v.rekening === 'cv' || v.rekening === 'pribadi' ? v.rekening : '',
        units, unitKodes: kodesDari(units), gedung: rapikanGedung(v.gedung || [], units), catatan: str(v.catatan, 1000),
        baru: false, cekTeknisi: false, // disimpan admin = sudah dicek
        updatedAt: Date.now(),
      };
      if (id) tx.update(ref, doc); else tx.set(ref, { ...doc, createdAt: Date.now() });
    });
    await catat(me, id ? 'Data pelanggan diubah' : 'Pelanggan ditambah', 'pelanggan', ref.id);
    return { id: ref.id };
  });
}

/* hapus data pelanggan — khusus pemilik; order lama tetap ada (nama tersimpan di order); stiker unitnya kembali kosong */
export async function hapusPelanggan(id: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    const ref = db.doc('pelanggan/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      for (const u of (s.get('units') || []) as UnitAC[]) if (u.kode) tx.set(db.doc('stiker/' + u.kode), { status: 'kosong', pelangganId: FieldValue.delete(), unitId: FieldValue.delete() }, { merge: true });
      keSampah(tx, me, 'pelanggan', s.id, s.data(), s.get('nama') || 'Pelanggan');
      tx.delete(ref);
    });
    await catat(me, 'Pelanggan dihapus (ke tempat sampah)', 'pelanggan', str(id, 64), '', '');
  });
}

/* ---------------- stiker QR & unit AC di lapangan ---------------- */
const cekKode = (teks: string) => {
  const kode = kodeDariTeks(teks);
  if (!POLA_KODE.test(kode)) throw new UserError('Kode stiker tidak terbaca. Contoh: GT-0015.');
  return kode;
};

/* pemilik/admin: buat nomor stiker kosong untuk dicetak (maks. 120 = 10 lembar A4 sekali buat) */
export async function buatStikerKosong(jumlah: number): Promise<ResultOf<{ dari: string; sampai: string }>> {
  return guarded('admin', async me => {
    const n = Math.min(120, Math.max(1, Math.round(num(jumlah))));
    const db = adminDb();
    return db.runTransaction(async tx => {
      const c = await tx.get(COUNTER_UNIT());
      const awal = (c.get('n') || 0) + 1, batch = Date.now();
      for (let i = 0; i < n; i++) {
        const kode = kodeStiker(awal + i);
        tx.create(db.doc('stiker/' + kode), { kode, status: 'kosong', batch, dibuatAt: batch, oleh: me.nama });
      }
      tx.set(COUNTER_UNIT(), { n: awal + n - 1 });
      return { dari: kodeStiker(awal), sampai: kodeStiker(awal + n - 1) };
    });
  });
}

/* pemilik/admin: beri nomor stiker langsung ke unit yang belum punya (mis. konsumen dari form), lalu dicetak per konsumen */
export async function beriStikerUnit(pelangganId: string): Promise<ResultOf<{ jumlah: number }>> {
  return guarded('admin', async me => {
    const db = adminDb();
    const ref = db.doc('pelanggan/' + str(pelangganId, 64));
    return db.runTransaction(async tx => {
      const [snap, c] = [await tx.get(ref), await tx.get(COUNTER_UNIT())];
      if (!snap.exists) throw new UserError('Pelanggan tidak ditemukan.');
      const units = ((snap.get('units') || []) as UnitAC[]).map(u => ({ ...u }));
      let n = c.get('n') || 0, jumlah = 0;
      for (const u of units) {
        if (u.kode || u.nonaktif) continue;
        u.kode = kodeStiker(++n); jumlah++;
        tx.create(db.doc('stiker/' + u.kode), { kode: u.kode, status: 'aktif', pelangganId: snap.id, unitId: u.id, batch: Date.now(), dibuatAt: Date.now(), oleh: me.nama, dipasang: { oleh: me.nama, at: Date.now() } });
      }
      if (!jumlah) return { jumlah };
      tx.set(COUNTER_UNIT(), { n });
      tx.update(ref, { units, unitKodes: kodesDari(units), updatedAt: Date.now() });
      return { jumlah };
    });
  });
}

/* pemilik/admin: daftar stiker yang belum terpasang (untuk cetak ulang) */
export async function daftarStikerKosong(): Promise<ResultOf<Stiker[]>> {
  return guarded('admin', async () => {
    const q = await adminDb().collection('stiker').where('status', '==', 'kosong').get();
    return q.docs.map(d => d.data() as Stiker).sort((a, b) => a.kode.localeCompare(b.kode));
  }, true);
}

export type InfoStiker = { kode: string; status: StatusStiker | 'tidak ada'; pelangganId?: string; unitId?: string; pelanggan?: string; alamat?: string; lokasi?: string; spec?: string };
/* cek stiker sebelum dipasang: kalau sudah terpakai, tampilkan milik siapa */
export async function cekStiker(teks: string): Promise<ResultOf<InfoStiker>> {
  return guarded('karyawan', async () => {
    const kode = cekKode(teks);
    const db = adminDb();
    const s = await db.doc('stiker/' + kode).get();
    if (!s.exists) return { kode, status: 'tidak ada' };
    const st = s.data() as Stiker;
    if (st.status !== 'aktif' || !st.pelangganId) return { kode, status: st.status };
    const p = await db.doc('pelanggan/' + st.pelangganId).get();
    const u = ((p.get('units') || []) as UnitAC[]).find(x => x.id === st.unitId);
    return { kode, status: 'aktif', pelangganId: st.pelangganId, unitId: st.unitId, pelanggan: p.get('nama') || '', alamat: p.get('alamat') || '', lokasi: u ? lokasiUnit(u) : '', spec: u ? specUnit(u) : '' };
  }, true);
}

/* Karyawan hanya boleh mengubah unit milik pelanggan dari order yang ia tangani. Dibaca di fase baca transaksi. */
async function bacaIzinPelanggan(tx: Transaction, me: Me, pelangganId: string, orderId?: string) {
  const db = adminDb();
  let order: Order | null = null;
  if (orderId) {
    const o = await tx.get(db.doc('orders/' + str(orderId, 64)));
    if (!o.exists) throw new UserError('Order tidak ditemukan.');
    order = normOrder({ id: o.id, ...o.data() });
    bolehOrder(me, order);
    if (!pelangganId) pelangganId = order.pelangganId;
    if (order.pelangganId !== pelangganId) throw new UserError('Unit ini bukan milik konsumen di order ini.');
  } else if (me.peran === 'karyawan') throw new UserError('Buka dari tugas order untuk mencatat unit.');
  if (!pelangganId) throw new UserError('Order ini belum terhubung ke data konsumen. Minta admin menyimpan ulang order.');
  const ref = db.doc('pelanggan/' + str(pelangganId, 64));
  const snap = await tx.get(ref);
  if (!snap.exists) throw new UserError('Data konsumen tidak ditemukan.');
  return { ref, snap, order, units: ((snap.get('units') || []) as UnitAC[]).map(u => ({ ...u })) };
}

/* pasang stiker ke unit (fase tulis). Stiker lama unit itu ditandai "Sudah diganti". */
function tulisPasang(tx: Transaction, me: Me, stiker: DocumentSnapshot, pelangganId: string, unit: UnitAC) {
  const kode = stiker.id;
  if (!stiker.exists) throw new UserError(`Stiker ${kode} tidak terdaftar. Cek lagi nomornya.`);
  const st = stiker.data() as Stiker;
  if (st.status === 'aktif' && !(st.pelangganId === pelangganId && st.unitId === unit.id)) throw new UserError(`Stiker ${kode} sudah terpasang di unit lain.`);
  if (st.status === 'diganti') throw new UserError(`Stiker ${kode} sudah tidak berlaku (pernah diganti). Pakai stiker lain.`);
  const db = adminDb();
  if (unit.kode && unit.kode !== kode) tx.set(db.doc('stiker/' + unit.kode), { status: 'diganti', digantiOleh: kode }, { merge: true });
  tx.set(db.doc('stiker/' + kode), { status: 'aktif', pelangganId, unitId: unit.id, dipasang: { oleh: me.nama, at: Date.now() } }, { merge: true });
  unit.kode = kode;
}

/* pasang / ganti stiker unit yang sudah ada (teknisi lewat order, atau admin dari data konsumen) */
export async function pasangStiker(v: { pelangganId: string; unitId: string; kode: string; orderId?: string }): Promise<Result> {
  return run('karyawan', async me => {
    const kode = cekKode(v.kode);
    const db = adminDb();
    await db.runTransaction(async tx => {
      const izin = await bacaIzinPelanggan(tx, me, str(v.pelangganId, 64), v.orderId);
      const stiker = await tx.get(db.doc('stiker/' + kode));
      const unit = izin.units.find(u => u.id === v.unitId);
      if (!unit) throw new UserError('Unit tidak ditemukan. Muat ulang halaman.');
      tulisPasang(tx, me, stiker, izin.snap.id, unit);
      tx.update(izin.ref, { units: izin.units, unitKodes: kodesDari(izin.units), updatedAt: Date.now() });
    });
  });
}

export type UnitLapanganInput = {
  orderId: string; unitId?: string; gantiUnit?: boolean; kode?: string;
  gedung: string; label: string; noAc: string; merk: string; pk: string; tipe: string; freon: string; catatan: string; inverter: boolean;
};
/* Teknisi mencatat / memperbarui unit AC di lokasi (dari tugas order). gantiUnit: AC lama diganti baru → spesifikasi lama masuk riwayat.
   Data masuk dengan tanda "Baru dari teknisi" sampai admin mengeceknya. */
export async function simpanUnitLapangan(v: UnitLapanganInput): Promise<ResultOf<{ unitId: string }>> {
  return guarded('karyawan', async me => {
    const label = str(v.label, 120);
    if (!label) throw new UserError('Isi nama ruangan.');
    const kode = v.kode ? cekKode(v.kode) : '';
    const db = adminDb();
    return db.runTransaction(async tx => {
      const izin = await bacaIzinPelanggan(tx, me, '', v.orderId);
      const stiker = kode ? await tx.get(db.doc('stiker/' + kode)) : null;
      const o = izin.order!;
      if (o.status === 'Batal') throw new UserError('Order ini sudah dibatalkan admin.');
      const daftarGedung: string[] = izin.snap.get('gedung') || [];
      let gedung = str(v.gedung, 60);
      const sama = gedung && daftarGedung.find(g => g.toLowerCase() === gedung.toLowerCase());
      if (sama) gedung = sama;
      const spec = { gedung, label, noAc: str(v.noAc, 20), merk: str(v.merk, 40), pk: str(v.pk, 10), tipe: str(v.tipe, 20), freon: str(v.freon, 12), catatan: str(v.catatan, 500), inverter: !!v.inverter };
      let unit = v.unitId ? izin.units.find(u => u.id === v.unitId) : undefined;
      if (v.unitId && !unit) throw new UserError('Unit tidak ditemukan. Muat ulang halaman.');
      if (unit) {
        if (v.gantiUnit) {
          unit.riwayat = [...(unit.riwayat || []), { merk: unit.merk || '', pk: unit.pk || '', tipe: unit.tipe || '', freon: unit.freon || '', tahun: unit.tahun || '', sampai: o.tanggal, ket: 'Diganti unit baru', oleh: me.nama }].slice(-20);
          unit.tahun = ''; delete unit.fotoIndoor; delete unit.fotoOutdoor; delete unit.garansi;
        }
        Object.assign(unit, spec);
      } else {
        if (izin.units.length >= 300) throw new UserError('Unit konsumen ini sudah terlalu banyak.');
        unit = { id: idAcak(), ...spec, tipe: spec.tipe || 'Split', intervalBulan: +izin.snap.get('intervalBulan') || 3 };
        izin.units.push(unit);
      }
      /* unit yang dicatat saat order ini = ikut diservis pada tanggal order */
      if (!unit.servisTerakhir || unit.servisTerakhir < o.tanggal) { unit.servisTerakhir = o.tanggal; unit.perkiraan = false; }
      unit.cek = true; unit.dicatat = { oleh: me.nama, at: Date.now() };
      if (stiker) tulisPasang(tx, me, stiker, izin.snap.id, unit);
      tx.update(izin.ref, {
        units: izin.units, unitKodes: kodesDari(izin.units),
        gedung: gedung && !sama ? [...daftarGedung, gedung].slice(0, 80) : daftarGedung,
        cekTeknisi: true, updatedAt: Date.now(),
      });
      return { unitId: unit.id };
    });
  });
}

/* foto name plate indoor/outdoor unit (Drive). Foto lama di sisi yang sama dibuang ke Sampah Drive. */
export async function fotoNameplate(v: { orderId?: string; pelangganId: string; unitId: string; sisi: 'indoor' | 'outdoor'; base64: string }): Promise<Result> {
  return run('karyawan', async me => {
    if (v.sisi !== 'indoor' && v.sisi !== 'outdoor') throw new UserError('Sisi foto tidak dikenal.');
    const jpeg = Buffer.from(String(v.base64 || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    if (jpeg.length < 1000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new UserError('File foto tidak valid.');
    if (jpeg.length > 2_500_000) throw new UserError('Foto terlalu besar.');
    const db = adminDb();
    /* cek izin & unit dulu sebelum upload */
    const pra = await db.runTransaction(async tx => {
      const izin = await bacaIzinPelanggan(tx, me, str(v.pelangganId, 64), v.orderId);
      const u = izin.units.find(x => x.id === v.unitId);
      if (!u) throw new UserError('Unit tidak ditemukan. Muat ulang halaman.');
      return { nama: izin.snap.get('nama') as string, lokasi: lokasiUnit(u) };
    });
    let fileId: string;
    try {
      fileId = await uploadFoto(`Name plate ${v.sisi} ${pra.nama.slice(0, 40)} ${pra.lokasi.slice(0, 60)} ${todayWIB()}.jpg`.replace(/[\\/]/g, '-'), todayWIB().slice(0, 7), jpeg);
    } catch (e) {
      console.error(e);
      const m = e instanceof Error ? e.message : '';
      throw new UserError(m === 'FOTO_BELUM_AKTIF' ? 'Penyimpanan foto belum disambungkan pemilik (Pengaturan → Foto).' : 'Upload foto gagal. Coba lagi.');
    }
    const lamaId = await db.runTransaction(async tx => {
      const izin = await bacaIzinPelanggan(tx, me, str(v.pelangganId, 64), v.orderId);
      const u = izin.units.find(x => x.id === v.unitId);
      if (!u) throw new UserError('Unit tidak ditemukan.');
      const key = v.sisi === 'indoor' ? 'fotoIndoor' : 'fotoOutdoor';
      const lama = u[key];
      u[key] = fileId;
      tx.update(izin.ref, { units: izin.units, fotoIds: FieldValue.arrayUnion(fileId), updatedAt: Date.now() });
      return lama;
    });
    if (lamaId) try { await buangFoto(lamaId); } catch (e) { console.error(e); }
  });
}

/* ---------------- stok (harga beli hanya bisa diubah pemilik) ---------------- */
/* Barang roll (pipa AC, kabel, …): rolls = panjang tiap roll utuh, qty = sisa eceran. Barang biasa: qty = jumlah stok. */
type StokInput = {
  nama: string; kategori: string; satuan: string; min: number; hargaBeli: number | null; hargaJual: number; hargaMitra?: number; qty?: number;
  roll?: boolean; panjangRoll?: number; rolls?: number[];
};
const cleanRolls = (rolls: unknown) => (Array.isArray(rolls) ? rolls : []).slice(0, 200).map(x => r3(num(x))).filter(x => x > 0);
const fmtRoll = (rolls: number[]) => `${rolls.length} roll (${rolls.map(x => x.toLocaleString('id-ID')).join(' · ')})`;
const sum = (xs: number[]) => r3(xs.reduce((a, x) => a + x, 0));

export async function saveStok(id: string | null, v: StokInput): Promise<Result> {
  return run('admin', async me => {
    const nama = str(v.nama, 120);
    if (!nama) throw new UserError('Nama barang wajib diisi.');
    const roll = !!v.roll;
    const doc: Record<string, unknown> = {
      nama, kategori: str(v.kategori, 40), satuan: str(v.satuan, 20), min: Math.max(0, num(v.min)), hargaJual: Math.max(0, num(v.hargaJual)), hargaMitra: Math.max(0, num(v.hargaMitra)),
      roll, panjangRoll: roll ? Math.max(0, r3(num(v.panjangRoll))) || 30 : null,
    };
    if (me.peran === 'owner') doc.hargaBeli = Math.max(0, num(v.hargaBeli));
    const db = adminDb();
    if (id) {
      const ref = db.doc('stok/' + str(id, 64));
      await db.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists) throw new UserError('Barang tidak ditemukan.');
        const lama: number[] = s.get('rolls') || [];
        if (roll && !s.get('roll')) doc.rolls = [];
        /* mode roll dimatikan: roll utuh yang tersisa digabung ke jumlah stok biasa */
        if (!roll && s.get('roll') && lama.length) { doc.qty = r3((+s.get('qty') || 0) + sum(lama)); doc.rolls = []; }
        tx.update(ref, doc);
      });
      await catat(me, 'Barang stok diubah', 'stok', ref.id, '', nama);
      return;
    }
    const qty = r3(Math.max(0, num(v.qty)));
    const rolls = roll ? cleanRolls(v.rolls) : [];
    const batch = db.batch();
    const ref = db.collection('stok').doc();
    batch.set(ref, { hargaBeli: 0, ...doc, qty, rolls });
    const total = r3(qty + sum(rolls));
    if (total) batch.set(db.collection('mutasi').doc(), {
      createdAt: Date.now(), tanggal: todayWIB(), itemId: ref.id, nama, jenis: 'Masuk', qty: total,
      ket: 'Stok awal' + (rolls.length ? ` · ${fmtRoll(rolls)}${qty ? ` + ${qty.toLocaleString('id-ID')} eceran` : ''}` : ''),
    });
    await batch.commit();
    await catat(me, 'Barang stok ditambah', 'stok', '', '', nama);
  });
}

export async function deleteStok(id: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    let nama = '';
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      nama = s.get('nama') || '';
      keSampah(tx, me, 'stok', s.id, s.data(), nama);
      tx.delete(ref);
    });
    await catat(me, 'Barang stok dihapus (ke tempat sampah)', 'stok', str(id, 64), '', nama);
  });
}

/* qty = tambahan eceran/jumlah biasa; rolls = roll utuh yang masuk (khusus barang roll). harga = harga beli per satuan */
export async function stokMasuk(id: string, qty: number, harga: number, ket: string, rolls: number[] = []): Promise<Result> {
  return run('admin', async me => {
    const q = r3(Math.max(0, num(qty)));
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Barang tidak ditemukan.');
      const r = s.get('roll') ? cleanRolls(rolls) : [];
      if (q <= 0 && !r.length) throw new UserError('Isi jumlah masuk lebih dari 0.');
      const upd: Record<string, unknown> = { qty: r3((+s.get('qty') || 0) + q) };
      if (r.length) upd.rolls = [...(s.get('rolls') || []), ...r];
      if (me.peran === 'owner' && num(harga) > 0) upd.hargaBeli = num(harga);
      tx.update(ref, upd);
      const rinci = r.length ? fmtRoll(r) + (q ? ` + ${q.toLocaleString('id-ID')} eceran` : '') : '';
      tx.create(db.collection('mutasi').doc(), {
        createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Masuk', qty: r3(q + sum(r)),
        ket: [rinci, str(ket, 200)].filter(Boolean).join(' · '),
      });
    });
    await catat(me, 'Stok masuk', 'stok', str(id, 64), `+${q}${rolls.length ? ` + ${rolls.length} roll` : ''}`);
  });
}

/* buka satu roll utuh (urutan ke-idx) → panjangnya pindah ke eceran */
export async function bukaRoll(id: string, idx: number): Promise<Result> {
  return run('admin', async () => {
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Barang tidak ditemukan.');
      const rolls: number[] = [...(s.get('rolls') || [])];
      const i = Math.round(num(idx));
      if (!s.get('roll') || i < 0 || i >= rolls.length) throw new UserError('Roll tidak ditemukan. Muat ulang halaman.');
      const [p] = rolls.splice(i, 1);
      tx.update(ref, { rolls, qty: r3((+s.get('qty') || 0) + p) });
      tx.create(db.collection('mutasi').doc(), { createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Buka roll', qty: p, ket: 'Dibuka manual' });
    });
  });
}

/* hitung ulang: qty = jumlah/eceran hasil hitung fisik; rolls = daftar roll utuh hasil hitung (khusus barang roll) */
export async function stokKoreksi(id: string, qty: number, ket: string, rolls?: number[]): Promise<Result> {
  return run('admin', async me => {
    const q = r3(Math.max(0, num(qty)));
    const db = adminDb();
    const ref = db.doc('stok/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) throw new UserError('Barang tidak ditemukan.');
      const isRoll = !!s.get('roll');
      const baru = isRoll ? cleanRolls(rolls ?? s.get('rolls')) : [];
      const diff = r3(q + sum(baru) - (+s.get('qty') || 0) - (isRoll ? sum(s.get('rolls') || []) : 0));
      tx.update(ref, isRoll ? { qty: q, rolls: baru } : { qty: q });
      const rinci = isRoll ? `Jadi ${fmtRoll(baru)} + ${q.toLocaleString('id-ID')} eceran` : '';
      tx.create(db.collection('mutasi').doc(), {
        createdAt: Date.now(), tanggal: todayWIB(), itemId: s.id, nama: s.get('nama'), jenis: 'Koreksi', qty: (diff > 0 ? '+' : '') + diff,
        ket: [str(ket, 200) || 'Hitung ulang', rinci].filter(Boolean).join(' · '),
      });
    });
    await catat(me, 'Stok dihitung ulang', 'stok', str(id, 64), `eceran/jumlah jadi ${q}`);
  });
}

/* ---------------- karyawan & akun login nomor HP ---------------- */
type KaryawanInput = { nama: string; peran: string; hp: string; nonaktif: boolean; liburMingguan: number[]; posisi?: string; bisaKetua?: boolean; urutan?: number };

export async function saveKaryawan(id: string | null, v: KaryawanInput): Promise<Result> {
  return run('admin', async me => {
    const nama = str(v.nama, 80);
    if (!nama) throw new UserError('Nama wajib diisi.');
    const libur = [...new Set((v.liburMingguan || []).map(Number).filter(h => h >= 0 && h <= 6))].sort();
    const posisi = v.posisi && v.posisi in POSISI ? v.posisi : 'lainnya';
    const doc = { nama, peran: str(v.peran, 60) || POSISI[posisi as keyof typeof POSISI], hp: str(v.hp, 30), nonaktif: !!v.nonaktif, liburMingguan: libur,
      posisi, bisaKetua: posisi === 'helper' && !!v.bisaKetua, urutan: Math.max(0, Math.min(999, Math.round(num(v.urutan)))) };
    const db = adminDb();
    if (id) await db.doc('karyawan/' + str(id, 64)).update(doc);
    else await db.collection('karyawan').add({ ...doc, akun: null, createdAt: Date.now() });
    await catat(me, id ? 'Data karyawan diubah' : 'Karyawan ditambah', 'karyawan', id || '', '', nama);
  });
}

/* Akun karyawan: login dengan nomor HP + PIN yang diperiksa server kita (hash scrypt di akun/{uid}),
   lalu server membuat "tiket masuk" Clerk sekali pakai. Jadi aturan password Clerk tidak berlaku untuk PIN. */
const cekHp = (hp: string) => { const d = normalHp(hp); if (!d) throw new UserError('Nomor HP tidak valid. Contoh: 081234567890.'); return d; };
const cekPin = (p: string) => {
  const s = String(p || '');
  if (s.length < 6 || s.length > 32) throw new UserError('PIN minimal 6 karakter.');
  return s;
};
/* pesan error Clerk apa adanya (tidak ditebak), supaya mudah ditelusuri */
const clerkMsg = (e: unknown) => {
  const errs = (e as { errors?: { code?: string; longMessage?: string; message?: string }[] })?.errors;
  const code = errs?.[0]?.code || '';
  if (/form_identifier_exists|username_exists/.test(code)) return 'Nomor HP ini sudah dipakai akun lain.';
  return `Gagal di Clerk (${code || 'unknown'}): ${errs?.[0]?.longMessage || errs?.[0]?.message || 'coba lagi.'}`;
};

/* Pemilik boleh membuat akun admin/karyawan; admin hanya akun karyawan, dan tidak bisa mengubah akun admin. */
async function karyawanUntukAkun(me: Me, kid: string) {
  const snap = await adminDb().doc('karyawan/' + str(kid, 64)).get();
  if (!snap.exists) throw new UserError('Karyawan tidak ditemukan.');
  const k = { id: snap.id, ...snap.data() } as Karyawan;
  if (me.peran !== 'owner' && k.akun?.peran === 'admin') throw new UserError('Hanya pemilik yang bisa mengubah akun admin.');
  return k;
}

export async function buatAkun(kid: string, hp: string, password: string, peran: 'admin' | 'karyawan' | 'layar'): Promise<Result> {
  return run('admin', async me => {
    if (peran !== 'karyawan' && me.peran !== 'owner') throw new UserError('Hanya pemilik yang bisa membuat akun admin / perangkat absen.');
    const k = await karyawanUntukAkun(me, kid);
    if (k.akun) throw new UserError('Karyawan ini sudah punya akun login.');
    const nohp = cekHp(hp), pin = cekPin(password);
    const role = peran === 'admin' || peran === 'layar' ? peran : 'karyawan';
    const db = adminDb();
    const dup = await db.collection('akun').where('hp', '==', nohp).limit(1).get();
    if (!dup.empty) throw new UserError('Nomor HP ini sudah dipakai akun lain.');
    const clerk = await clerkClient();
    let uid: string;
    try {
      const u = await clerk.users.createUser({ username: clerkUsername(nohp), password: passwordAcak(), firstName: k.nama.slice(0, 50), skipPasswordChecks: true });
      uid = u.id;
    } catch (e) { console.error(e); throw new UserError(clerkMsg(e)); }
    const { salt, hash } = hashPin(pin);
    const batch = db.batch();
    batch.set(db.doc('akun/' + uid), { peran: role, karyawanId: k.id, nama: k.nama, username: nohp, hp: nohp, pinSalt: salt, pinHash: hash, gagal: 0, createdAt: Date.now(), oleh: me.nama });
    batch.update(db.doc('karyawan/' + k.id), { akun: { uid, username: nohp, peran: role } });
    await batch.commit();
    await catat(me, 'Akun login dibuat', 'karyawan', k.id, `peran ${role}`);
  });
}

/* Ganti PIN: simpan hash baru + keluarkan akun dari semua HP (sesi Clerk dicabut). */
export async function resetPassword(kid: string, password: string): Promise<Result> {
  return run('admin', async me => {
    const k = await karyawanUntukAkun(me, kid);
    if (!k.akun) throw new UserError('Karyawan ini belum punya akun.');
    const { salt, hash } = hashPin(cekPin(password));
    await adminDb().doc('akun/' + k.akun.uid).update({ pinSalt: salt, pinHash: hash, gagal: 0, lockUntil: 0 });
    try { await (await clerkClient()).users.updateUser(k.akun.uid, { password: passwordAcak(), skipPasswordChecks: true, signOutOfOtherSessions: true }); }
    catch (e) { console.error(e); /* PIN sudah diganti; gagal logout paksa tidak fatal */ }
    await catat(me, 'PIN diganti', 'karyawan', k.id);
  });
}

/* Login karyawan (tanpa sesi): cek nomor HP + PIN → tiket masuk Clerk berlaku 60 detik.
   5× salah → dikunci 15 menit. Pesan error sengaja umum supaya tidak membocorkan nomor yang terdaftar. */
export async function loginPin(hp: string, pin: string): Promise<ResultOf<{ ticket: string }>> {
  try {
    const nohp = normalHp(hp);
    const salahMsg = { ok: false as const, error: 'Nomor HP atau PIN salah.' };
    if (!nohp || String(pin || '').length < 6) return salahMsg;
    const db = adminDb();
    const q = await db.collection('akun').where('hp', '==', nohp).limit(1).get();
    if (q.empty) return salahMsg;
    const ref = q.docs[0].ref, a = q.docs[0].data();
    const now = Date.now();
    if ((a.lockUntil || 0) > now) return { ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((a.lockUntil - now) / 60000)} menit.` };
    if (!cocokPin(String(pin), a.pinSalt, a.pinHash)) {
      const gagal = (a.gagal || 0) + 1;
      await ref.update(gagal >= MAKS_GAGAL ? { gagal: 0, lockUntil: now + KUNCI_MENIT * 60000 } : { gagal });
      return gagal >= MAKS_GAGAL ? { ok: false, error: `PIN salah ${MAKS_GAGAL}×. Akun dikunci ${KUNCI_MENIT} menit.` } : salahMsg;
    }
    const kar = a.karyawanId ? await db.doc('karyawan/' + a.karyawanId).get() : null;
    if (kar?.get('nonaktif')) return { ok: false, error: 'Akun ini sudah nonaktif. Hubungi admin.' };
    await ref.update({ gagal: 0, lockUntil: 0, lastLogin: now });
    const t = await (await clerkClient()).signInTokens.createSignInToken({ userId: ref.id, expiresInSeconds: 60 });
    return { ok: true, data: { ticket: t.token } };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Login gagal. Periksa koneksi lalu coba lagi.' };
  }
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
    await catat(me, 'Akun login dihapus', 'karyawan', k.id);
  });
}

/* pemilik: hapus karyawan yang sudah nonaktif. Data karyawan masuk tempat sampah (bisa dipulihkan 30 hari
   atau dihapus permanen di menu Riwayat & Sampah); akun loginnya ikut dihapus. Catatan absensi lama tetap ada di arsip Sheet. */
export async function hapusKaryawan(kid: string): Promise<Result> {
  return run('owner', async me => {
    const db = adminDb();
    const ref = db.doc('karyawan/' + str(kid, 64));
    const s = await ref.get();
    if (!s.exists) return;
    if (!s.get('nonaktif')) throw new UserError('Nonaktifkan karyawan ini dulu, baru bisa dihapus.');
    const akun = s.get('akun') as Karyawan['akun'];
    if (akun?.uid) {
      try { await (await clerkClient()).users.deleteUser(akun.uid); } catch (e) { console.error(e); /* akun mungkin sudah terhapus di Clerk */ }
      await db.doc('akun/' + akun.uid).delete();
    }
    await db.runTransaction(async tx => {
      const x = await tx.get(ref);
      if (!x.exists) return;
      keSampah(tx, me, 'karyawan', x.id, { ...x.data(), akun: null }, x.get('nama') || 'Karyawan');
      tx.delete(ref);
    });
    await catat(me, 'Karyawan dihapus (ke tempat sampah)', 'karyawan', s.id, akun ? 'akun login ikut dihapus' : '', s.get('nama') || '');
  });
}

/* ---------------- absensi ---------------- */
/* Token QR untuk Layar Absen (pemilik/admin). Berganti tiap 30 detik. */
export async function qrToken(): Promise<ResultOf<{ token: string; sisa: number }>> {
  /* pemilik, admin, atau akun perangkat absen — karyawan tidak boleh membuat QR sendiri */
  return guarded('layar', async me => { if (me.peran === 'karyawan') throw new UserError('Layar Absen hanya untuk pemilik, admin, atau perangkat absen.'); return buatTokenQR(); }, true);
}

/* pemilik: ubah peran akun login (mis. akun uji jadi perangkat absen) */
export async function ubahPeranAkun(kid: string, peran: 'admin' | 'karyawan' | 'layar'): Promise<Result> {
  return run('owner', async me => {
    if (!['admin', 'karyawan', 'layar'].includes(peran)) throw new UserError('Peran tidak dikenal.');
    const db = adminDb();
    const kref = db.doc('karyawan/' + str(kid, 64));
    const k = await kref.get();
    const akun = k.get('akun') as Karyawan['akun'];
    if (!k.exists || !akun) throw new UserError('Karyawan ini belum punya akun login.');
    const batch = db.batch();
    batch.update(db.doc('akun/' + akun.uid), { peran });
    batch.update(kref, { akun: { ...akun, peran }, ...(peran === 'layar' ? { posisi: 'perangkat' } : {}) });
    await batch.commit();
    await catat(me, 'Peran akun diubah', 'karyawan', str(kid, 64), `jadi ${peran}`);
  });
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
    await catat(me, 'Absensi diinput / dikoreksi', 'karyawan', kid, `${fmtTglR(tanggal)}: ${status} — ${ket}`);
  });
}

/* ---------------- pengajuan izin / sakit ---------------- */
const hariAntara = (dari: string, sampai: string) => { const out: string[] = []; for (let t = dari; t <= sampai && out.length < 31; t = addDays(t, 1)) out.push(t); return out; };

/* karyawan mengajukan izin/sakit untuk dirinya; untuk hari ini paling lambat sebelum jam masuk */
export async function ajukanIzin(v: { dari: string; sampai: string; jenis: string; alasan: string }): Promise<Result> {
  return run('karyawan', async me => {
    if (!me.karyawanId) throw new UserError('Akun ini belum terhubung ke data karyawan.');
    const dari = str(v.dari, 10), sampai = str(v.sampai, 10) || dari, alasan = str(v.alasan, 300);
    if (!isDate(dari) || !isDate(sampai) || sampai < dari) throw new UserError('Tanggal tidak valid.');
    if (hariAntara(dari, sampai).length > 14) throw new UserError('Maksimal 14 hari per pengajuan.');
    const today = todayWIB();
    if (dari < today) throw new UserError('Tanggal yang sudah lewat tidak bisa diajukan. Hubungi admin.');
    const db = adminDb();
    const st = ((await db.doc('settings/usaha').get()).data() || {}) as Settings;
    if (dari === today && nowTimeWIB() >= jamMasukTgl(st, today))
      throw new UserError(`Pengajuan untuk hari ini paling lambat sebelum jam masuk (${jamMasukTgl(st, today)}). Hubungi admin langsung.`);
    if (!alasan) throw new UserError('Tuliskan alasannya.');
    const k = await db.doc('karyawan/' + me.karyawanId).get();
    await db.collection('izin').add({
      kid: me.karyawanId, nama: k.get('nama') || me.nama, dari, sampai, jenis: JENIS_IZIN.includes(v.jenis as never) ? v.jenis : 'Izin',
      alasan, status: 'menunggu', at: Date.now(),
    });
  });
}

/* karyawan membatalkan pengajuannya yang belum diputuskan */
export async function batalIzin(id: string): Promise<Result> {
  return run('karyawan', async me => {
    const ref = adminDb().doc('izin/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) return;
    if (s.get('kid') !== me.karyawanId && me.peran === 'karyawan') throw new UserError('Bukan pengajuan Anda.');
    if (s.get('status') !== 'menunggu') throw new UserError('Pengajuan sudah diputuskan, tidak bisa dibatalkan.');
    await ref.delete();
  });
}

/* pemilik/admin menyetujui atau menolak; kalau disetujui, absensi tanggal-tanggal itu jadi Sakit/Izin */
export async function putuskanIzin(id: string, setuju: boolean): Promise<Result> {
  return run('admin', async me => {
    const db = adminDb();
    const ref = db.doc('izin/' + str(id, 64));
    const s = await ref.get();
    if (!s.exists) throw new UserError('Pengajuan tidak ditemukan.');
    const iz = { id: s.id, ...s.data() } as Izin;
    if (me.peran !== 'owner' && iz.kid === me.karyawanId) throw new UserError('Pengajuan Anda sendiri diputuskan oleh pemilik.');
    if (iz.status !== 'menunggu') throw new UserError('Pengajuan ini sudah diputuskan.');
    await ref.update({ status: setuju ? 'disetujui' : 'ditolak', diputus: { oleh: me.nama, at: Date.now() } });
    await catat(me, setuju ? 'Izin disetujui' : 'Izin ditolak', 'izin', iz.id);
    if (!setuju) return;
    const status = iz.jenis === 'Sakit' ? 'Sakit' : 'Izin';
    for (const tgl of hariAntara(iz.dari, iz.sampai)) {
      const aref = db.doc('absensi/' + tgl);
      const rec: AbsRecord = { status, ket: `${iz.jenis}: ${iz.alasan}`, via: 'Pengajuan', oleh: me.nama };
      const ditulis = await db.runTransaction(async tx => {
        const records = ((await tx.get(aref)).get('records') || {}) as Record<string, AbsRecord>;
        if (records[iz.kid]?.status === 'Hadir') return false; // sudah terlanjur masuk kerja → tidak ditimpa
        tx.set(aref, { tanggal: tgl, records: { ...records, [iz.kid]: rec } });
        return true;
      });
      if (ditulis && tgl < todayWIB()) await arsipKoreksi(tgl, iz.nama, rec, me.nama);
    }
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
      if (records[kid]) keSampah(tx, me, 'absensi', tanggal, records[kid], `Absensi ${fmtTglR(tanggal)}`, { kid });
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
  return run('admin', async me => {
    const db = adminDb();
    const ref = db.doc('catatan/' + str(id, 64));
    await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      keSampah(tx, me, 'catatan', s.id, s.data(), s.get('judul') || 'Catatan');
      tx.delete(ref);
    });
  });
}

/* ---------------- pengaturan (pemilik) ---------------- */
export async function saveSettings(v: Settings): Promise<Result> {
  return run('owner', async me => {
    const jamMasuk = str(v.jamMasuk, 5) || '08:00', jamMasukMinggu = str(v.jamMasukMinggu, 5);
    if (!isTime(jamMasuk) || !isTime(jamMasukMinggu)) throw new UserError('Jam masuk tidak valid.');
    await adminDb().doc('settings/usaha').set({
      nama: str(v.nama, 120), alamat: str(v.alamat, 300), hp: str(v.hp, 30), jamMasuk, jamMasukMinggu, rekening: str(v.rekening, 1000),
      templatePengingat: str(v.templatePengingat, 1000),
      rekeningInstansi: str(v.rekeningInstansi, 1000), penanggungJawab: str(v.penanggungJawab, 80), jabatan: str(v.jabatan, 60),
      email: str(v.email, 120), npwp: str(v.npwp, 40),
    }, { merge: true }); // merge: kolom lain (mis. template ajakan form) tidak ikut terhapus
    await catat(me, 'Pengaturan usaha diubah', '', '', '', 'Pengaturan');
  });
}

/* Pesan ajakan isi form daftar — boleh diubah admin & pemilik. {link} = link form, {usaha} = nama usaha. */
export async function saveTemplateAjak(teks: string): Promise<Result> {
  return run('admin', async () => {
    const t = str(teks, 1500);
    if (t && !t.includes('{link}')) throw new UserError('Pesan harus memuat {link} supaya link form ikut terkirim.');
    await adminDb().doc('settings/usaha').set({ templateAjakForm: t }, { merge: true });
  });
}

/* ---------------- cari order lama (lebih tua dari yang dimuat dashboard) ---------------- */
const MAKS_CARI = 100;
const urutBaru = (os: Order[]) => os.sort((a, b) => (b.tanggal + (b.jam || '')).localeCompare(a.tanggal + (a.jam || '')));

/* cari berdasarkan nomor invoice, nomor HP, atau nama pelanggan */
export async function cariOrderLama(q: string): Promise<ResultOf<Order[]>> {
  return guarded('admin', async () => {
    const kata = str(q, 80);
    if (kata.length < 3) throw new UserError('Ketik minimal 3 huruf / angka.');
    const db = adminDb();
    const hasil = new Map<string, Order>();
    const masuk = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.forEach(d => hasil.set(d.id, normOrder({ id: d.id, ...d.data() })));
    /* nomor invoice (persis) */
    if (/^inv/i.test(kata)) masuk(await db.collection('orders').where('invoice', '==', kata.toUpperCase().replace(/\s+/g, '')).get());
    /* pelanggan: nomor HP atau nama */
    const hp = normalHp(kata);
    const pel = (await db.collection('pelanggan').get()).docs
      .filter(p => (hp && p.get('hpNorm') === hp) || String(p.get('nama') || '').toLowerCase().includes(kata.toLowerCase()))
      .slice(0, 15);
    for (const p of pel) masuk(await db.collection('orders').where('pelangganId', '==', p.id).get());
    /* order tanpa data pelanggan: cocokkan nomor HP / nama persis seperti yang tercatat di order */
    if (hp && !pel.length) masuk(await db.collection('orders').where('hp', '==', kata).get());
    if (!pel.length && !hp) masuk(await db.collection('orders').where('pelanggan', '==', kata).get());
    return urutBaru([...hasil.values()]).slice(0, MAKS_CARI);
  }, true);
}

/* semua order satu pelanggan (untuk riwayat lengkap di data pelanggan) */
export async function orderPelangganLengkap(pelangganId: string): Promise<ResultOf<Order[]>> {
  return guarded('admin', async () => {
    const s = await adminDb().collection('orders').where('pelangganId', '==', str(pelangganId, 64)).get();
    return urutBaru(s.docs.map(d => normOrder({ id: d.id, ...d.data() }))).slice(0, 500);
  }, true);
}

/* ambil ulang order tertentu (supaya order lama yang sedang dibuka ikut segar setelah diubah) */
export async function ambilOrder(ids: string[]): Promise<ResultOf<Order[]>> {
  return guarded('admin', async () => {
    const db = adminDb();
    const daftar = [...new Set((ids || []).map(x => str(x, 64)).filter(Boolean))].slice(0, 300);
    if (!daftar.length) return [];
    const snaps = await db.getAll(...daftar.map(id => db.doc('orders/' + id)));
    return snaps.filter(x => x.exists).map(x => normOrder({ id: x.id, ...x.data() }));
  }, true);
}

/* versi data terakhir — dicek dashboard tiap 15 detik (1 pembacaan kecil) */
export async function versiData(): Promise<number> {
  const r = await guarded('karyawan', async () => bacaVersi(), true);
  return r.ok ? r.data : 0;
}

/* pesan WA otomatis di halaman scan stiker ({kode}, {lokasi}, {ruangan}, {gedung}, {merk}) */
export async function saveTemplateScan(teks: string): Promise<Result> {
  return run('admin', async () => {
    await adminDb().doc('settings/usaha').set({ templateScan: str(teks, 600) }, { merge: true });
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

/* pemilik: backup lengkap (semua data, JSON) ke Google Drive sekarang */
export async function backupLengkapSekarang(): Promise<Result> {
  return run('owner', async () => {
    try { await buatBackupLengkap(); }
    catch (e) {
      console.error(e);
      const m = e instanceof Error ? e.message : String(e);
      await catatGagalBackupLengkap(m);
      throw new UserError(/aksi tidak dikenal/i.test(m) ? 'Skrip Drive masih versi lama. Perbarui skrip Apps Script dulu (lihat panduan di Pengaturan → Backup).'
        : m === 'FOTO_BELUM_AKTIF' ? 'Skrip Drive belum tersambung (Pengaturan → Foto bukti kerja).' : 'Backup lengkap gagal. Coba lagi beberapa saat lagi.');
    }
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
