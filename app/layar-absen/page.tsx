import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAccess } from '@/lib/access';
import { AuthShell } from '@/components/auth-shell';
import { LayarAbsen } from '@/components/absen/layar-absen';

/* Layar QR untuk HP/tablet di bengkel. Hanya pemilik & admin. */
export default function Page() {
  return (
    <Suspense fallback={<div className="empty" style={{ paddingTop: 80 }}>Memuat…</div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const a = await getAccess();
  if (a.kind === 'signed-out') redirect('/sign-in?redirect_url=%2Flayar-absen');
  if (a.kind !== 'ok' || a.me.peran === 'karyawan')
    return (
      <AuthShell>
        <div className="panel max-w-md text-center">
          <h3 className="justify-center">Khusus pemilik & admin</h3>
          <p className="muted">Layar Absen hanya bisa dibuka oleh akun pemilik atau admin.</p>
        </div>
      </AuthShell>
    );
  return <LayarAbsen />;
}
