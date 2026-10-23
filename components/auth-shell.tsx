import { Suspense } from 'react';
import Image from 'next/image';
import { APP_NAME } from '@/lib/brand';

/* Logo GT (vektor): versi terang, dan versi huruf putih saat tema gelap */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <>
      <Image src="/logo.svg" alt="" aria-hidden width={size} height={size} priority className="dark:hidden" style={{ flex: 'none' }} />
      <Image src="/logo-gelap.svg" alt="" aria-hidden width={size} height={size} priority className="hidden dark:block" style={{ flex: 'none' }} />
    </>
  );
}

/* Bingkai halaman masuk/daftar & halaman pemberitahuan (belum ada akses, dsb). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap flex min-h-dvh flex-col items-center justify-center gap-6 py-10">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-2xl leading-none">{APP_NAME}</h1>
          <div className="muted text-sm">Order · Stok · Absensi · Invoice · Catatan</div>
        </div>
      </div>
      <Suspense fallback={<div className="empty">Memuat…</div>}>{children}</Suspense>
    </main>
  );
}
