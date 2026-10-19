import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAccess } from '@/lib/access';
import { AuthShell } from '@/components/auth-shell';
import { AbsenScan } from '@/components/absen/absen-scan';

/* Halaman yang terbuka setelah karyawan scan QR di Layar Absen: /absen?k=<token> */
export default function Page({ searchParams }: PageProps<'/absen'>) {
  return (
    <AuthShell>
      <Suspense fallback={<div className="empty">Memuat…</div>}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Gate({ searchParams }: { searchParams: PageProps<'/absen'>['searchParams'] }) {
  const sp = await searchParams;
  const k = typeof sp.k === 'string' ? sp.k : '';
  const a = await getAccess();
  if (a.kind === 'signed-out') redirect('/sign-in?redirect_url=' + encodeURIComponent('/absen?k=' + k));
  if (a.kind !== 'ok')
    return <div className="panel max-w-md text-center"><h3 className="justify-center">Akun belum punya akses</h3><p className="muted">Minta admin membuatkan akun login nomor HP untuk Anda.</p></div>;
  if (!k) return <div className="panel max-w-md text-center"><h3 className="justify-center">QR tidak terbaca</h3><p className="muted">Scan QR yang tampil di Layar Absen bengkel.</p></div>;
  return <AbsenScan token={k} />;
}
