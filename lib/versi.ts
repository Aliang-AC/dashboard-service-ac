import 'server-only';
import { adminDb } from './firebase-admin';

/* Penanda versi data (meta/versi). Setiap aksi yang mengubah data memperbaruinya; dashboard di HP cukup
   mengecek dokumen kecil ini tiap 15 detik dan baru memuat ulang semua data kalau versinya berubah.
   Jauh lebih hemat pembacaan database dibanding memuat ulang semua data terus-menerus. */
export const tandaiBerubah = () => adminDb().doc('meta/versi').set({ at: Date.now() }).catch(e => console.error('versi', e));
export const bacaVersi = async () => ((await adminDb().doc('meta/versi').get()).get('at') as number) || 0;
