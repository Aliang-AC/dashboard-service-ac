'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import useSWR from 'swr';
import { loadAll } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { NAMA_USAHA, WA_USAHA_TAMPIL } from '@/lib/brand';
import { labelUnit } from '@/lib/servis';

type Item = { kode: string; unit: string; pelanggan: string; pid: string };

/* Lembar stiker A4: 4 kolom × 5 baris, tiap stiker 48×52 mm (logo, QR, kode unit, WA usaha).
   Cetak langsung, atau pilih "Simpan sebagai PDF" di jendela cetak untuk dikirim ke percetakan. */
export function CetakStiker() {
  const sp = useSearchParams();
  const hanya = sp.get('p');
  const { data } = useSWR('stiker-all', async () => { const r = await loadAll(); if (!r.ok) throw new Error(r.error); return r.data; });
  const semua: Item[] = useMemo(() => (data?.pelanggan || [])
    .filter(p => !hanya || p.id === hanya)
    .flatMap(p => (p.units || []).filter(u => u.kode).map(u => ({ kode: u.kode!, unit: labelUnit(u), pelanggan: p.nama, pid: p.id })))
    .sort((a, b) => a.pelanggan.localeCompare(b.pelanggan) || a.kode.localeCompare(b.kode)), [data, hanya]);
  const tanpaKode = (data?.pelanggan || []).filter(p => !hanya || p.id === hanya).reduce((a, p) => a + (p.units || []).filter(u => !u.kode).length, 0);
  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const [salinan, setSalinan] = useState(1);
  const [qr, setQr] = useState<Record<string, string>>({});
  const dipilih = semua.filter(x => pilih[x.kode] ?? true);
  const lembar = dipilih.flatMap(x => Array.from({ length: salinan }, () => x));

  useEffect(() => {
    const origin = location.origin;
    Promise.all(semua.map(async x => [x.kode, await QRCode.toString(`${origin}/u/${x.kode}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })] as const))
      .then(r => setQr(Object.fromEntries(r)));
  }, [semua]);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 6mm; }
        .lembar { display: grid; grid-template-columns: repeat(4, 48mm); gap: 2mm; justify-content: center; }
        .stk { width: 48mm; height: 52mm; border: .3mm dashed #bbb; border-radius: 3mm; padding: 2.5mm; box-sizing: border-box;
               display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: #fff; color: #111; break-inside: avoid; }
        .stk .top { display: flex; align-items: center; gap: 1.5mm; font: 700 2.6mm/1.1 Arial, sans-serif; }
        .stk .qr { width: 30mm; height: 30mm; }
        .stk .qr svg { width: 100%; height: 100%; }
        .stk .kode { font: 700 3.4mm/1 Consolas, monospace; letter-spacing: .2mm; }
        .stk .bawah { font: 2.2mm/1.2 Arial, sans-serif; text-align: center; }
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .wrap { max-width: none !important; padding: 0 !important; } }
      `}</style>
      <main className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
        <div className="no-print panel" style={{ marginBottom: 14 }}>
          <h3>Cetak stiker QR unit AC</h3>
          <p className="hint">Pilih unit, lalu klik <b>Cetak</b>. Gunakan kertas stiker A4 (print sendiri), atau pilih <b>“Simpan sebagai PDF”</b> di jendela cetak lalu kirim file PDF-nya ke percetakan (disarankan stiker vinyl tahan air). Ukuran tiap stiker ±4,8 × 5,2 cm.</p>
          {tanpaKode > 0 && <p className="hint" style={{ color: 'var(--warn)' }}>{tanpaKode} unit belum punya kode — buka data konsumennya lalu klik Simpan agar kode dibuat.</p>}
          {!data ? <div className="empty">Memuat data…</div> : semua.length ? (
            <>
              <div className="actions" style={{ margin: '8px 0' }}>
                <Button size="sm" variant="outline" onClick={() => setPilih(Object.fromEntries(semua.map(x => [x.kode, true])))}>Pilih semua</Button>
                <Button size="sm" variant="outline" onClick={() => setPilih(Object.fromEntries(semua.map(x => [x.kode, false])))}>Kosongkan</Button>
                <label className="sm">Salinan per unit <input className="field" type="number" min={1} max={4} value={salinan} onChange={e => setSalinan(Math.min(4, Math.max(1, +e.target.value || 1)))} style={{ width: 60, display: 'inline-block' }} /></label>
                <Button onClick={() => window.print()} disabled={!lembar.length}>🖨 Cetak {lembar.length} stiker</Button>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                {semua.map(x => (
                  <label key={x.kode} className="sm" style={{ display: 'flex', gap: 8, padding: '2px 0', color: 'var(--ink)' }}>
                    <input type="checkbox" checked={pilih[x.kode] ?? true} onChange={e => setPilih(s => ({ ...s, [x.kode]: e.target.checked }))} />
                    <span className="mono">{x.kode}</span> {x.pelanggan} · {x.unit}
                  </label>
                ))}
              </div>
            </>
          ) : <div className="empty">Belum ada unit AC berkode. Tambahkan unit di data konsumen.</div>}
        </div>
        <div className="lembar">
          {lembar.map((x, n) => (
            <div key={x.kode + n} className="stk">
              <div className="top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" style={{ height: '5mm' }} />{NAMA_USAHA}
              </div>
              <div className="qr" dangerouslySetInnerHTML={{ __html: qr[x.kode] || '' }} />
              <div className="kode">{x.kode}</div>
              <div className="bawah">Scan untuk cek & pesan servis<br />WA {WA_USAHA_TAMPIL}</div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
