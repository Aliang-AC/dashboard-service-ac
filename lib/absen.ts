import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminDb } from './firebase-admin';
import { a1, isDefaultTab, sheetsApi } from './sheets';
import { fmtMonth } from './format';
import { HARI, jamMasukTgl, type AbsRecord, type Absensi, type Karyawan, type Lokasi } from './types';

/* ---------- lokasi bengkel ---------- */
/* Titik default: Cv. Glory Teknik service AC (Aliang AC), Jl. MT. Haryono Pal 5, Sintang (dari Google Maps). */
export const LOKASI_DEFAULT: Lokasi = { lat: 0.0448138, lng: 111.4703799, radius: 100 };

export async function getLokasi(): Promise<Lokasi> {
  const s = await adminDb().doc('settings/lokasi').get();
  return s.exists ? (s.data() as Lokasi) : LOKASI_DEFAULT;
}

/* jarak dua titik GPS dalam meter (rumus haversine) */
export function jarakMeter(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* ---------- QR berganti tiap 30 detik ---------- */
/* Token = jendela waktu (30 dtk) + HMAC rahasia. Diterima untuk jendela sekarang & sebelumnya (maks. ±60 dtk),
   jadi foto QR yang dikirim lewat WA cepat kedaluwarsa. Rahasia disimpan di Firestore, tidak pernah dikirim ke browser. */
export const QR_DETIK = 30;

async function rahasia(): Promise<string> {
  const ref = adminDb().doc('rahasia/absensi');
  const s = await ref.get();
  if (s.exists && s.get('secret')) return s.get('secret');
  const secret = randomBytes(32).toString('hex');
  await ref.set({ secret, createdAt: Date.now() });
  return secret;
}
const sign = (secret: string, w: number) => createHmac('sha256', secret).update('absen:' + w).digest('base64url').slice(0, 22);

export async function buatTokenQR() {
  const w = Math.floor(Date.now() / 1000 / QR_DETIK);
  const sisa = QR_DETIK - (Math.floor(Date.now() / 1000) % QR_DETIK);
  return { token: `${w}.${sign(await rahasia(), w)}`, sisa };
}

export async function cekTokenQR(token: string) {
  const [ws, sig] = String(token || '').split('.');
  const w = Number(ws), now = Math.floor(Date.now() / 1000 / QR_DETIK);
  if (!Number.isInteger(w) || !sig || (w !== now && w !== now - 1)) return false;
  const good = Buffer.from(sign(await rahasia(), w)), got = Buffer.from(sig);
  return good.length === got.length && timingSafeEqual(good, got);
}

/* ---------- aturan hari & telat ---------- */
export const menitTelat = (masuk?: string, jamMasuk = '08:00') => {
  if (!masuk) return 0;
  const m = (t: string) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
  return Math.max(0, m(masuk) - m(jamMasuk));
};
export const hariDari = (tanggal: string) => new Date(tanggal + 'T00:00:00Z').getUTCDay();
export const liburRutin = (k: Karyawan, tanggal: string) => (k.liburMingguan || []).includes(hariDari(tanggal));

/* ---------- proses tengah malam: Alpa otomatis + arsip ke Drive ---------- */
/* Karyawan aktif yang tidak punya catatan apa pun di `tanggal` dan bukan hari libur rutinnya → Alpa. */
export async function tandaiAlpa(tanggal: string) {
  const db = adminDb();
  const [kar, absSnap] = await Promise.all([db.collection('karyawan').get(), db.doc('absensi/' + tanggal).get()]);
  const records = (absSnap.get('records') || {}) as Record<string, AbsRecord>;
  const endOfDay = new Date(tanggal + 'T23:59:59+07:00').getTime();
  const patch: Record<string, AbsRecord> = {};
  kar.docs.forEach(d => {
    const k = { id: d.id, ...d.data() } as Karyawan & { createdAt?: number };
    if (k.nonaktif || records[k.id]?.status || liburRutin(k, tanggal)) return;
    if (k.createdAt && k.createdAt > endOfDay) return;
    patch[k.id] = { status: 'Alpa', via: 'Otomatis', ket: 'Tidak absen' };
  });
  if (Object.keys(patch).length) await db.doc('absensi/' + tanggal).set({ tanggal, records: patch }, { merge: true });
  return Object.keys(patch).length;
}

const HEADER = ['Tanggal', 'Hari', 'Nama', 'Status', 'Masuk', 'Pulang', 'Telat (menit)', 'Jarak masuk (m)', 'Jarak pulang (m)', 'Lokasi masuk', 'Cara', 'Dicatat oleh', 'Keterangan', 'Perlu perhatian'];

/* satu baris arsip; `awalan` dipakai untuk baris koreksi */
function barisArsip(tanggal: string, nama: string, r: AbsRecord, jamMasuk: string, awalan = '') {
  const telat = r.status === 'Hadir' ? menitTelat(r.masuk, jamMasuk) : 0;
  const tanpaPulang = r.status === 'Hadir' && !!r.masuk && !r.pulang;
  const ket = [awalan, r.ket, tanpaPulang ? 'Tidak absen pulang' : ''].filter(Boolean).join(' · ');
  const merah = r.status === 'Alpa' || telat > 0 || tanpaPulang;
  return [tanggal, HARI[hariDari(tanggal)], nama, r.status || '', r.masuk || '', r.pulang || '', telat,
    r.masukLoc?.jarak ?? '', r.pulangLoc?.jarak ?? '',
    r.masukLoc ? `https://www.google.com/maps?q=${r.masukLoc.lat},${r.masukLoc.lng}` : '',
    r.via || '', r.oleh || '', ket, merah ? 'Ya' : ''];
}

/* pastikan tab bulan ada, lengkap dengan judul kolom + aturan baris merah; kembalikan nama tab */
async function siapkanTab(api: Awaited<ReturnType<typeof sheetsApi>>, tanggal: string) {
  const tab = fmtMonth(tanggal.slice(0, 7));
  const existing = await api.tabs();
  let tabId = existing.find(t => t.title === tab)?.sheetId;
  if (tabId === undefined) {
    const add = await api.call(':batchUpdate', { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] });
    tabId = add.replies[0].addSheet.properties.sheetId as number;
  }
  const head = await api.call(`/values/${encodeURIComponent(a1(tab) + '!A1:A1')}`);
  if (!head.values?.length) {
    const range = { sheetId: tabId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADER.length };
    const red = { backgroundColor: { red: 0.98, green: 0.85, blue: 0.85 }, textFormat: { foregroundColor: { red: 0.65, green: 0.1, blue: 0.1 } } };
    const requests: object[] = [
      /* baris merah kalau kolom N "Perlu perhatian" = Ya (Alpa, telat, atau tidak absen pulang).
         Rumus tanpa koma/titik koma supaya berlaku di spreadsheet berbahasa apa pun. */
      { addConditionalFormatRule: { index: 0, rule: { ranges: [range], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$N2="Ya"' }] }, format: red } } } },
      { repeatCell: { range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
    ];
    existing.filter(t => isDefaultTab(t.title)).forEach(t => requests.push({ deleteSheet: { sheetId: t.sheetId } }));
    await api.call(':batchUpdate', { requests });
    await api.call(`/values/${encodeURIComponent(a1(tab) + '!A1')}:append?valueInputOption=RAW`, { values: [HEADER] });
  }
  return tab;
}

const tambahBaris = (api: Awaited<ReturnType<typeof sheetsApi>>, tab: string, rows: unknown[][]) =>
  api.call(`/values/${encodeURIComponent(a1(tab) + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: rows });

/* Tambahkan baris absensi `tanggal` ke file "Absensi Karyawan" (tab per bulan). Tidak pernah menimpa. */
export async function arsipkan(tanggal: string) {
  const db = adminDb();
  const cfg = await db.doc('settings/arsip').get();
  const sheetId = cfg.get('absensiSheetId') as string | undefined;
  if (!sheetId) return { skipped: 'arsip belum diatur' };
  if ((cfg.get('lastDate') || '') >= tanggal) return { skipped: 'sudah diarsipkan' };

  const [kar, absSnap, setSnap] = await Promise.all([db.collection('karyawan').get(), db.doc('absensi/' + tanggal).get(), db.doc('settings/usaha').get()]);
  const jamMasuk = jamMasukTgl(setSnap.data() || {}, tanggal);
  const records = ((absSnap.data() as Absensi | undefined)?.records || {}) as Record<string, AbsRecord>;
  const nama = (id: string) => kar.docs.find(d => d.id === id)?.get('nama') || '(dihapus)';
  const rows = Object.entries(records)
    .sort((a, b) => nama(a[0]).localeCompare(nama(b[0])))
    .map(([kid, r]) => barisArsip(tanggal, nama(kid), r, jamMasuk));

  const api = await sheetsApi(sheetId);
  const tab = await siapkanTab(api, tanggal);
  if (rows.length) await tambahBaris(api, tab, rows);
  await db.doc('settings/arsip').set({ lastDate: tanggal }, { merge: true });
  return { rows: rows.length };
}

/* Koreksi/hapus untuk tanggal yang SUDAH diarsipkan → tambah baris "KOREKSI" (baris lama tetap ada sebagai jejak).
   rec = null berarti absensi dihapus. Gagal menulis arsip tidak membatalkan koreksi di dashboard. */
export async function arsipKoreksi(tanggal: string, nama: string, rec: AbsRecord | null, oleh: string) {
  try {
    const db = adminDb();
    const cfg = await db.doc('settings/arsip').get();
    const sheetId = cfg.get('absensiSheetId') as string | undefined;
    if (!sheetId || (cfg.get('lastDate') || '') < tanggal) return; // belum diarsipkan: nanti ikut proses malam
    const jamMasuk = jamMasukTgl((await db.doc('settings/usaha').get()).data() || {}, tanggal);
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
    const row = rec
      ? barisArsip(tanggal, nama, { ...rec, oleh }, jamMasuk, `KOREKSI ${waktu}`)
      : [tanggal, HARI[hariDari(tanggal)], nama, 'DIHAPUS', '', '', '', '', '', '', 'Manual', oleh, `KOREKSI ${waktu} · absensi dihapus pemilik`, ''];
    const api = await sheetsApi(sheetId);
    await tambahBaris(api, await siapkanTab(api, tanggal), [row]);
  } catch (e) { console.error('arsipKoreksi', e); }
}

