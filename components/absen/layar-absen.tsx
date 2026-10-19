'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import useSWR from 'swr';
import { loadAll, qrToken } from '@/app/actions';
import { Logo } from '@/components/auth-shell';

/* QR berisi link /absen?k=<token>; token berganti tiap 30 detik (dibuat di server). */
export function LayarAbsen() {
  const [svg, setSvg] = useState('');
  const [sisa, setSisa] = useState(0);
  const [err, setErr] = useState('');
  const deadline = useRef(0);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const r = await qrToken().catch(() => null);
      if (stop) return;
      if (!r || !r.ok) { setErr(r && !r.ok ? r.error : 'Koneksi terputus, mencoba lagi…'); timer = setTimeout(refresh, 5000); return; }
      setErr('');
      const url = `${location.origin}/absen?k=${encodeURIComponent(r.data.token)}`;
      setSvg(await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
      deadline.current = Date.now() + r.data.sisa * 1000;
      timer = setTimeout(refresh, r.data.sisa * 1000 + 300);
    };
    refresh();
    const tick = setInterval(() => setSisa(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => { stop = true; clearTimeout(timer); clearInterval(tick); };
  }, []);

  /* layar tetap menyala (kalau browser mendukung) */
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const req = () => nav.wakeLock?.request('screen').then(l => (lock = l)).catch(() => {});
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, []);

  /* daftar yang sudah absen hari ini */
  const { data } = useSWR('layar-all', async () => { const r = await loadAll(); if (!r.ok) throw new Error(r.error); return r.data; }, { refreshInterval: 10000 });
  const rec = data?.absensi.find(a => a.id === data.today)?.records || {};
  const hadir = (data?.karyawan || [])
    .filter(k => !k.nonaktif && rec[k.id]?.masuk)
    .sort((a, b) => (rec[b.id].pulang || rec[b.id].masuk || '').localeCompare(rec[a.id].pulang || rec[a.id].masuk || ''));

  return (
    <main className="wrap flex min-h-dvh flex-col items-center gap-5 py-6 text-center">
      <div className="flex items-center gap-3"><Logo /><h1 className="text-2xl leading-none">{data?.settings.nama || 'Layar Absen'}</h1></div>
      <div>
        <div className="muted">Scan pakai kamera HP untuk absen masuk / pulang</div>
        <div className="num text-3xl font-semibold">{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB</div>
      </div>
      <div className="panel" style={{ padding: 16, width: 'min(78vmin, 520px)', background: '#fff' }}>
        {svg ? <div aria-label="QR absen" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="empty">Menyiapkan QR…</div>}
      </div>
      <div className="muted">{err || `QR berganti dalam ${sisa} detik`}</div>
      {hadir.length > 0 && (
        <div className="panel" style={{ width: 'min(92vw, 520px)', textAlign: 'left' }}>
          <h3>Sudah absen hari ini · {hadir.length}</h3>
          <ul className="list">
            {hadir.map(k => (
              <li key={k.id}>
                <div className="main"><b>{k.nama}</b></div>
                <span className="num">{rec[k.id].masuk}{rec[k.id].pulang ? ` – ${rec[k.id].pulang}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
