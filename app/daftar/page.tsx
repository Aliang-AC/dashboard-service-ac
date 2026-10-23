import type { Metadata } from 'next';
import { FormDaftar } from '@/components/publik/form-daftar';
import { KopPublik } from '@/components/publik/kop-publik';
import { MEREK_LENGKAP, WA_USAHA_TAMPIL } from '@/lib/brand';

export const metadata: Metadata = { title: `Daftar pelanggan · ${MEREK_LENGKAP}`, description: 'Daftarkan unit AC Anda untuk pengingat cuci AC rutin.' };

/* Halaman publik (tanpa login) untuk konsumen mendaftarkan diri & unit AC-nya. */
export default function Page() {
  return (
    <main className="wrap" style={{ maxWidth: 560, paddingTop: 16, paddingBottom: 48 }}>
      <KopPublik />
      <h2 style={{ fontSize: '1.5rem', margin: '6px 0' }}>Daftar pelanggan & pengingat cuci AC</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Isi data di bawah sekali saja. Kami akan mengingatkan lewat WhatsApp saat AC Anda sudah waktunya dibersihkan (umumnya tiap 3 bulan),
        supaya tetap dingin, hemat listrik, dan awet.
      </p>
      <FormDaftar />
      <p className="muted" style={{ textAlign: 'center', fontSize: '.85rem', marginTop: 18 }}>Butuh bantuan? WA : {WA_USAHA_TAMPIL} (Admin)</p>
    </main>
  );
}
