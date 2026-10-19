import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { SignOutButton, UserButton } from '@clerk/nextjs';
import { getAccess } from '@/lib/access';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { DashboardEntry } from '@/components/dashboard/entry';

export default function Page() {
  return (
    <Suspense fallback={<div className="empty" style={{ paddingTop: 80 }}>Memuat…</div>}>
      <Gate />
    </Suspense>
  );
}

/* Cek login & hak akses di server sebelum dashboard ditampilkan. */
async function Gate() {
  const a = await getAccess();
  if (a.kind === 'signed-out') redirect('/sign-in');

  if (a.kind === 'no-db')
    return (
      <AuthShell>
        <div className="panel max-w-md text-center">
          <h3 className="justify-center">Database belum tersambung</h3>
          <p className="muted">Kunci Firebase Admin belum diisi di <span className="mono">.env.local</span> (atau di Environment Variables Vercel). Setelah diisi, muat ulang halaman ini.</p>
        </div>
        <UserButton />
      </AuthShell>
    );

  if (a.kind === 'denied')
    return (
      <AuthShell>
        <div className="panel max-w-md text-center">
          <h3 className="justify-center">Akun ini belum punya akses</h3>
          <p className="muted">
            Kamu masuk sebagai <b className="mono">{a.login}</b>. Karyawan login memakai <b>nomor HP + password</b> yang
            dibuatkan admin di menu <b>Absensi → Data karyawan</b>.
          </p>
          <SignOutButton>
            <Button variant="outline" className="mt-3">Keluar & ganti akun</Button>
          </SignOutButton>
        </div>
      </AuthShell>
    );

  return <DashboardEntry />;
}
