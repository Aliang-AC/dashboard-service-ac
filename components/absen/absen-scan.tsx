'use client';
import { useEffect, useRef, useState } from 'react';
import { absenQR } from '@/app/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type State =
  | { s: 'lokasi' }
  | { s: 'kirim' }
  | { s: 'ok'; jenis: 'masuk' | 'pulang'; jam: string; jarak: number; nama: string }
  | { s: 'gagal'; pesan: string; ulangLokasi?: boolean };

/* Ambil lokasi GPS HP → kirim ke server bersama token QR. Server yang memutuskan diterima/ditolak. */
export function AbsenScan({ token }: { token: string }) {
  const [st, setSt] = useState<State>({ s: 'lokasi' });
  const started = useRef(false);

  const mulai = () => {
    setSt({ s: 'lokasi' });
    if (!('geolocation' in navigator)) return setSt({ s: 'gagal', pesan: 'HP ini tidak mendukung GPS di browser.' });
    navigator.geolocation.getCurrentPosition(
      async pos => {
        setSt({ s: 'kirim' });
        const r = await absenQR(token, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).catch(() => null);
        if (!r) return setSt({ s: 'gagal', pesan: 'Koneksi internet terputus. Scan ulang QR.' });
        setSt(r.ok ? { s: 'ok', ...r.data } : { s: 'gagal', pesan: r.error, ulangLokasi: /posisi|Lokasi/.test(r.error) });
      },
      err => setSt({
        s: 'gagal', ulangLokasi: true,
        pesan: err.code === err.PERMISSION_DENIED
          ? 'Izin lokasi ditolak. Buka pengaturan browser → izinkan Lokasi untuk situs ini, lalu coba lagi.'
          : 'Lokasi belum terbaca. Pastikan GPS/Lokasi HP menyala, lalu coba lagi.',
      }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  useEffect(() => { if (!started.current) { started.current = true; mulai(); } }); // sekali saat halaman terbuka

  const box = (bg: string, children: React.ReactNode) => (
    <div className="panel max-w-md text-center" style={{ background: bg, padding: 24 }}>{children}</div>
  );
  if (st.s === 'lokasi') return box('var(--surface)', <><h3 className="justify-center">Membaca lokasi…</h3><p className="muted">Izinkan akses lokasi kalau diminta browser.</p></>);
  if (st.s === 'kirim') return box('var(--surface)', <h3 className="justify-center">Mencatat absen…</h3>);
  if (st.s === 'ok')
    return box('var(--good-soft)', <>
      <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden>✓</div>
      <h3 className="justify-center" style={{ color: 'var(--good)' }}>Absen {st.jenis} tercatat</h3>
      <p><b>{st.nama}</b> · <span className="num">{st.jam} WIB</span></p>
      <p className="muted">Jarak dari bengkel {st.jarak} m</p>
      <Button nativeButton={false} variant="outline" className="mt-3" render={<Link href="/" />}>Ke dashboard</Button>
    </>);
  return box('var(--bad-soft)', <>
    <div style={{ fontSize: 48, lineHeight: 1, color: 'var(--bad)' }} aria-hidden>✕</div>
    <h3 className="justify-center" style={{ color: 'var(--bad)' }}>Absen gagal</h3>
    <p>{st.pesan}</p>
    <div className="actions" style={{ justifyContent: 'center', marginTop: 12 }}>
      {st.ulangLokasi && <Button onClick={mulai}>Coba lagi</Button>}
      <Button nativeButton={false} variant="outline" render={<Link href="/" />}>Ke dashboard</Button>
    </div>
  </>);
}
