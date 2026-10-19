import 'server-only';
import { adminDb } from './firebase-admin';

/* Foto bukti kerja disimpan di Google Drive pemilik lewat Google Apps Script (web app) yang dijalankan
   atas nama akun pemilik — jadi memakai kuota Drive pemilik, tanpa Shared Drive / OAuth.
   Konfigurasi di Firestore settings/foto: { url (web app /exec), secret } — secret sama dengan di skrip. */

type Cfg = { url?: string; secret?: string };
const cfg = async () => ((await adminDb().doc('settings/foto').get()).data() || {}) as Cfg;

async function panggil(c: Cfg, body: Record<string, unknown>) {
  if (!c.url || !c.secret) throw new Error('FOTO_BELUM_AKTIF');
  /* Apps Script membalas 302 ke googleusercontent; fetch mengikuti redirect (POST → GET) dan mengambil hasilnya */
  const res = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, secret: c.secret }), redirect: 'follow' });
  const text = await res.text();
  let j: { ok?: boolean; error?: string; [k: string]: unknown };
  try { j = JSON.parse(text); } catch { throw new Error(`Skrip foto tidak membalas JSON (HTTP ${res.status}). Pastikan deploy "Who has access: Anyone".`); }
  if (!j.ok) throw new Error('Skrip foto: ' + (j.error || 'gagal'));
  return j;
}

export async function fotoAktif() {
  const c = await cfg();
  return Boolean(c.url && c.secret);
}

export async function uploadFoto(nama: string, bulan: string, jpeg: Buffer) {
  const r = await panggil(await cfg(), { action: 'upload', name: nama, bulan, data: jpeg.toString('base64') });
  return String(r.id);
}

export async function ambilFoto(id: string) {
  const r = await panggil(await cfg(), { action: 'get', id });
  return Buffer.from(String(r.data), 'base64');
}

/* dipindah ke Sampah Drive pemilik (masih bisa dipulihkan 30 hari) */
export async function buangFoto(id: string) {
  await panggil(await cfg(), { action: 'trash', id });
}

/* simpan URL web app setelah dicek bisa dipanggil */
export async function sambungSkrip(url: string) {
  const c = await cfg();
  if (!c.secret) throw new Error('Kata sandi skrip belum disiapkan.');
  const r = await panggil({ url, secret: c.secret }, { action: 'ping' });
  await adminDb().doc('settings/foto').set({ url }, { merge: true });
  return String(r.folder || '');
}
