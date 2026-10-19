import type { Metadata } from 'next';
import { Logo } from '@/components/auth-shell';
import { FormDaftar } from '@/components/publik/form-daftar';
import { NAMA_USAHA, WA_USAHA_TAMPIL } from '@/lib/brand';

export const metadata: Metadata = { title: `Daftar pelanggan · ${NAMA_USAHA}`, description: 'Daftarkan unit AC Anda untuk pengingat cuci AC rutin.' };

/* Halaman publik (tanpa login) untuk konsumen mendaftarkan diri & unit AC-nya. */
export default function Page() {
  return (
    <main className="wrap" style={{ maxWidth: 560, paddingTop: 24, paddingBottom: 48 }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
        <Logo />
        <div>
          <h1 className="text-2xl leading-none">{NAMA_USAHA}</h1>
          <div className="muted text-sm">Service AC · WA {WA_USAHA_TAMPIL}</div>
        </div>
      </div>
      <h2 style={{ fontSize: '1.5rem', margin: '6px 0' }}>Daftar pelanggan & pengingat cuci AC</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Isi data di bawah sekali saja. Kami akan mengingatkan lewat WhatsApp saat AC Anda sudah waktunya dibersihkan (umumnya tiap 3 bulan),
        supaya tetap dingin, hemat listrik, dan awet.
      </p>
      <FormDaftar />
    </main>
  );
}
