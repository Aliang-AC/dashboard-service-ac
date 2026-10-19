import { redirect } from 'next/navigation';

/* Pendaftaran mandiri ditutup: akun karyawan dibuat oleh admin/pemilik (tab Absensi → Buat akun). */
export default function Page() {
  redirect('/sign-in');
}
