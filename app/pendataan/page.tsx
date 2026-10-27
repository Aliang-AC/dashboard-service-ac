import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAccess } from '@/lib/access';
import { AuthShell } from '@/components/auth-shell';
import { Pendataan } from '@/components/publik/pendataan';

/* Mode pendataan AC instansi (pemilik, admin, teknisi): scan stiker khusus → isi data unit AC, tanpa order. ?p=<id instansi> */
export default function Page() {
  return (
    <Suspense fallback={<div className="empty" style={{ paddingTop: 80 }}>Memuat…</div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const a = await getAccess();
  if (a.kind === 'signed-out') redirect('/sign-in?redirect_url=%2Fpendataan');
  if (a.kind !== 'ok' || a.me.peran === 'layar')
    return <AuthShell><div className="panel max-w-md text-center"><h3 className="justify-center">Khusus pemilik, admin & teknisi</h3></div></AuthShell>;
  return <Pendataan />;
}
