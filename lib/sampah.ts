import 'server-only';
import { adminDb } from './firebase-admin';

/* dijalankan tiap tengah malam: isi tempat sampah yang sudah lewat 30 hari dihapus permanen */
export async function bersihkanSampah() {
  const db = adminDb();
  const q = await db.collection('sampah').where('hapusPada', '<', Date.now()).limit(400).get();
  if (q.empty) return 0;
  const batch = db.batch();
  q.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return q.size;
}
