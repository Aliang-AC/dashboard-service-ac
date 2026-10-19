import 'server-only';
import { JWT } from 'google-auth-library';
import { adminDb } from './firebase-admin';

/* Foto bukti kerja disimpan di Shared Drive milik pemilik (akun robot Firebase = Content manager).
   Akun robot tidak punya kuota sendiri, jadi wajib Shared Drive, bukan My Drive.
   Konfigurasi di Firestore settings/foto: { driveId, folders: { 'YYYY-MM': folderId } } */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function token() {
  const jwt = new JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return (await jwt.getAccessToken()).token!;
}
async function cek(res: Response) {
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function fotoAktif() {
  return Boolean((await adminDb().doc('settings/foto').get()).get('driveId'));
}

/* folder bulanan "2026-10" di dalam Shared Drive (dibuat sekali, id disimpan) */
async function folderBulan(t: string, bulan: string) {
  const ref = adminDb().doc('settings/foto');
  const s = await ref.get();
  const driveId = s.get('driveId') as string | undefined;
  if (!driveId) throw new Error('FOTO_BELUM_AKTIF');
  const ada = (s.get('folders') || {})[bulan];
  if (ada) return ada as string;
  const q = encodeURIComponent(`name='${bulan}' and '${driveId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await (await cek(await fetch(`${API}/files?q=${q}&corpora=drive&driveId=${driveId}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)`, { headers: { Authorization: `Bearer ${t}` } }))).json();
  let id: string = found.files?.[0]?.id;
  if (!id) {
    const r = await (await cek(await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bulan, mimeType: 'application/vnd.google-apps.folder', parents: [driveId] }),
    }))).json();
    id = r.id;
  }
  await ref.set({ folders: { [bulan]: id } }, { merge: true });
  return id;
}

export async function uploadFoto(nama: string, bulan: string, jpeg: Buffer) {
  const t = await token();
  const parent = await folderBulan(t, bulan);
  const boundary = 'b' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nama, parents: [parent], mimeType: 'image/jpeg' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    jpeg,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await (await cek(await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  }))).json();
  return r.id as string;
}

export async function ambilFoto(id: string) {
  const t = await token();
  return cek(await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${t}` } }));
}

/* dipindah ke Sampah Shared Drive (masih bisa dipulihkan 30 hari) */
export async function buangFoto(id: string) {
  const t = await token();
  await cek(await fetch(`${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  }));
}

/* cek akses ke Shared Drive saat pemilik menyambungkan */
export async function cekDrive(driveId: string) {
  const t = await token();
  const r = await (await cek(await fetch(`${API}/drives/${encodeURIComponent(driveId)}?fields=id,name`, { headers: { Authorization: `Bearer ${t}` } }))).json();
  return r as { id: string; name: string };
}
