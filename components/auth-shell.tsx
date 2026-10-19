import { Suspense } from 'react';
import { APP_NAME } from '@/lib/brand';

export function Logo() {
  return (
    <div className="logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18" />
        <path d="m9 3.5 3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" />
      </svg>
    </div>
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
