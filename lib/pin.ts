import 'server-only';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* PIN karyawan disimpan sebagai hash scrypt (bukan PIN aslinya). */
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') };
}
export function cocokPin(pin: string, salt: string, hash: string) {
  if (!salt || !hash) return false;
  const a = scryptSync(pin, salt, 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Password Clerk acak & panjang yang tidak pernah dipakai manusia (login karyawan lewat PIN + tiket). */
export const passwordAcak = () => randomBytes(24).toString('base64url');

/* Nomor HP → bentuk standar 08xxxxxxxxxx; username Clerk diberi awalan "hp" karena Clerk menolak username angka semua. */
export function normalHp(hp: string) {
  let d = String(hp || '').replace(/\D/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  return /^0\d{8,13}$/.test(d) ? d : null;
}
export const clerkUsername = (hp: string) => 'hp' + hp;

export const MAKS_GAGAL = 5;
export const KUNCI_MENIT = 15;
