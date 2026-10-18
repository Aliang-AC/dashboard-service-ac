'use client';
import dynamic from 'next/dynamic';

/* Dashboard hanya dirender di browser: datanya selalu diambil setelah login,
   dan tab terakhir dibaca dari localStorage. */
export const DashboardEntry = dynamic(() => import('./dashboard').then(m => m.Dashboard), {
  ssr: false,
  loading: () => <div className="empty" style={{ paddingTop: 80 }}>Memuat dashboard…</div>,
});
