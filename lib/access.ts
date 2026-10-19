import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { adminDb, firebaseReady } from './firebase-admin';
import type { Me, Peran } from './types';

/* Peran:
   - owner   : email ada di env OWNER_EMAILS (login Google/email).
   - admin / karyawan : akun nomor HP yang dibuat pemilik/admin; datanya di koleksi `akun/{clerkUserId}`
     { peran, karyawanId, nama, username }. */
const owners = () =>
  (process.env.OWNER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export type AccessState =
  | { kind: 'signed-out' }
  | { kind: 'no-db' }
  | { kind: 'denied'; login: string }
  | { kind: 'ok'; me: Me };

export async function getAccess(): Promise<AccessState> {
  const user = await currentUser();
  if (!user) return { kind: 'signed-out' };
  /* semua email akun ini, termasuk dari login Google (atribut email di Clerk boleh dimatikan) */
  const emails = [
    user.primaryEmailAddress?.emailAddress, ...user.emailAddresses.map(e => e.emailAddress), ...user.externalAccounts.map(a => a.emailAddress),
  ].filter(Boolean).map(e => e!.toLowerCase());
  const email = emails[0] || '';
  const login = user.username || email || user.id;
  const nama = [user.firstName, user.lastName].filter(Boolean).join(' ') || login;
  if (!firebaseReady) return { kind: 'no-db' };
  if (emails.some(e => owners().includes(e))) {
    /* pemilik juga boleh terhubung ke data karyawan (opsional) lewat akun/{uid} */
    const a = await adminDb().doc('akun/' + user.id).get();
    return { kind: 'ok', me: { uid: user.id, nama, login, peran: 'owner', karyawanId: a.get('karyawanId') || null } };
  }
  const snap = await adminDb().doc('akun/' + user.id).get();
  if (snap.exists && (snap.get('peran') === 'admin' || snap.get('peran') === 'karyawan')) {
    return { kind: 'ok', me: { uid: user.id, nama: snap.get('nama') || nama, login, peran: snap.get('peran'), karyawanId: snap.get('karyawanId') || null } };
  }
  return { kind: 'denied', login };
}

export async function requireMe(): Promise<Me> {
  const a = await getAccess();
  if (a.kind !== 'ok') throw new Error(a.kind === 'no-db' ? 'Database belum tersambung.' : 'Akun ini belum punya akses.');
  return a.me;
}

/* urutan hak: owner > admin > karyawan */
export const atLeast = (p: Peran, min: Peran) => ({ owner: 3, admin: 2, karyawan: 1 })[p] >= ({ owner: 3, admin: 2, karyawan: 1 })[min];
