import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAccess } from '@/lib/access';
import { AuthShell } from '@/components/auth-shell';
import { CetakStiker } from '@/components/publik/cetak-stiker';

/* Halaman cetak stiker QR unit AC (pemilik & admin). ?p=<id pelanggan> untuk satu konsumen saja. */
export default function Page() {
  return (
    <Suspense fallback={<div className="empty" style={{ paddingTop: 80 }}>Memuat…</div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const a = await getAccess();
  if (a.kind === 'signed-out') redirect('/sign-in?redirect_url=%2Fstiker');
  if (a.kind !== 'ok' || a.me.peran === 'karyawan')
    return <AuthShell><div className="panel max-w-md text-center"><h3 className="justify-center">Khusus pemilik & admin</h3></div></AuthShell>;
  return <CetakStiker />;
}
