import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { adminDb, firebaseReady } from './firebase-admin';
import type { Me } from './types';

/* Pemilik ditentukan lewat env OWNER_EMAILS (pisah koma).
   Karyawan boleh masuk kalau emailnya terdaftar di koleksi `pengguna` (diatur pemilik di Pengaturan). */
const owners = () =>
  (process.env.OWNER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export type AccessState =
  | { kind: 'signed-out' }
  | { kind: 'no-db' }
  | { kind: 'denied'; email: string }
  | { kind: 'ok'; me: Me };

export async function getAccess(): Promise<AccessState> {
  const user = await currentUser();
  if (!user) return { kind: 'signed-out' };
  const email = (user.primaryEmailAddress?.emailAddress || '').toLowerCase();
  const nama = [user.firstName, user.lastName].filter(Boolean).join(' ') || email;
  if (!firebaseReady) return { kind: 'no-db' };
  if (owners().includes(email)) return { kind: 'ok', me: { email, nama, owner: true } };
  if (email) {
    const snap = await adminDb().doc('pengguna/' + email).get();
    if (snap.exists) return { kind: 'ok', me: { email, nama, owner: false } };
  }
  return { kind: 'denied', email };
}

export async function requireMe(): Promise<Me> {
  const a = await getAccess();
  if (a.kind !== 'ok') throw new Error(a.kind === 'no-db' ? 'Database belum tersambung.' : 'Akun ini belum punya akses.');
  return a.me;
}
