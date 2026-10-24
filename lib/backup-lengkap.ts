import 'server-only';
import { adminDb } from './firebase-admin';
import { simpanBackupDrive } from './drive';
import { todayWIB } from './format';

/* Backup lengkap mingguan: SEMUA data dashboard dalam satu file JSON di Google Drive
   (Karyawan AI / Dashboard Bisnis / Backup Lengkap). File ini bisa dipakai untuk memulihkan
   atau memindahkan seluruh data ke sistem lain kapan saja. Disimpan 26 file terbaru (±6 bulan).
   Yang SENGAJA tidak ikut: kunci rahasia (settings/foto, rahasia/*) dan hash PIN akun login. */
const KOLEKSI = ['orders', 'pelanggan', 'stok', 'mutasi', 'karyawan', 'absensi', 'catatan', 'rekap', 'stiker', 'tim', 'izin', 'riwayat', 'sampah', 'counters'];
const SETTINGS_AMAN = ['usaha', 'tarif', 'lokasi', 'arsip', 'backup'];

export async function buatBackupLengkap() {
  const db = adminDb();
  const koleksi: Record<string, unknown[]> = {};
  let jumlah = 0;
  for (const k of KOLEKSI) {
    const s = await db.collection(k).get();
    koleksi[k] = s.docs.map(d => ({ _id: d.id, ...d.data() }));
    jumlah += s.size;
  }
  /* akun login: hanya peran & hubungan ke karyawan, tanpa hash PIN */
  koleksi.akun = (await db.collection('akun').get()).docs.map(d => ({
    _id: d.id, peran: d.get('peran'), karyawanId: d.get('karyawanId'), nama: d.get('nama'), username: d.get('username'),
  }));
  const settings: Record<string, unknown> = {};
  for (const id of SETTINGS_AMAN) { const s = await db.doc('settings/' + id).get(); if (s.exists) settings[id] = s.data(); }
  koleksi.settings = Object.entries(settings).map(([id, v]) => ({ _id: id, ...(v as object) }));

  const isi = JSON.stringify({ aplikasi: 'Dashboard CV Glory Teknik', format: 1, dibuat: new Date().toISOString(), jumlahDokumen: jumlah, koleksi });
  const nama = `Backup lengkap ${todayWIB()} ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false }).slice(0, 5).replace(':', '')}.json`;
  const hasil = await simpanBackupDrive(nama, Buffer.from(isi, 'utf8'));
  const info = { at: Date.now(), ok: true, dokumen: jumlah, ukuranKb: Math.round(isi.length / 1024), url: hasil.url, folder: hasil.folder };
  await db.doc('settings/backupLengkap').set(info);
  return info;
}

/* catat kegagalan supaya terlihat di Pengaturan */
export async function catatGagalBackupLengkap(pesan: string) {
  await adminDb().doc('settings/backupLengkap').set({ at: Date.now(), ok: false, error: pesan.slice(0, 300) }, { merge: true });
}
