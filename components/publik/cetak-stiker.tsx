'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import useSWR from 'swr';
import { toast } from 'sonner';
import { beriStikerUnit, buatStikerKosong, daftarStikerKosong, loadAll, saveTemplateScan } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { MEREK, MEREK_ALIAS, TAGLINE, WA_USAHA_TAMPIL } from '@/lib/brand';
import { isiTemplateScan, lokasiUnit, TEMPLATE_SCAN } from '@/lib/unit';

type Item = { kode: string; ket: string };
const PER_LEMBAR = 12;

/* Lembar stiker A4: 3 kolom × 4 baris, tiap stiker 50 × 70 mm.
   Mode "kosong": stiker bernomor yang belum terpasang (dipasang teknisi di lokasi).
   Mode "konsumen" (?p=<id>): stiker unit milik satu konsumen. */
export function CetakStiker() {
  const sp = useSearchParams();
  const hanya = sp.get('p');
  const kosong = useSWR(hanya ? null : 'stiker-kosong', async () => { const r = await daftarStikerKosong(); if (!r.ok) throw new Error(r.error); return r.data; });
  const semua = useSWR('stiker-all', async () => { const r = await loadAll(); if (!r.ok) throw new Error(r.error); return r.data; });
  const p = semua.data?.pelanggan.find(x => x.id === hanya);

  const items: Item[] = useMemo(() => hanya
    ? (p?.units || []).filter(u => u.kode && !u.nonaktif).map(u => ({ kode: u.kode!, ket: lokasiUnit(u) }))
    : (kosong.data || []).map(s => ({ kode: s.kode, ket: `dibuat ${new Date(s.dibuatAt).toLocaleDateString('id-ID')}` })), [hanya, p, kosong.data]);
  const tanpaKode = (p?.units || []).filter(u => !u.kode && !u.nonaktif).length;

  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const [lembarBaru, setLembarBaru] = useState(1);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});
  const dipilih = items.filter(x => pilih[x.kode] ?? true);

  useEffect(() => {
    const origin = location.origin;
    Promise.all(items.map(async x => [x.kode, await QRCode.toString(`${origin}/u/${x.kode}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })] as const))
      .then(r => setQr(Object.fromEntries(r)));
  }, [items]);

  const buat = async () => {
    setBusy(true);
    const r = await buatStikerKosong(lembarBaru * PER_LEMBAR);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Stiker ${r.data.dari} s/d ${r.data.sampai} dibuat. Siap dicetak.`);
    kosong.mutate();
  };
  const beriKode = async () => {
    if (!p) return;
    setBusy(true);
    const r = await beriStikerUnit(p.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.data.jumlah} unit diberi nomor stiker.`);
    semua.mutate();
  };
  const loading = hanya ? !semua.data : !kosong.data;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 6mm; }
        .lembar { display: grid; grid-template-columns: repeat(3, 50mm); gap: 2mm 3mm; justify-content: center; }
        .stk { position: relative; width: 50mm; height: 70mm; border: .25mm solid #cfd6df; border-radius: 3mm; overflow: hidden; box-sizing: border-box;
               display: flex; flex-direction: column; align-items: center; background: #fff; color: #14202b; break-inside: avoid;
               -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; text-align: center; }
        .stk::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1.4mm; background: linear-gradient(90deg, #123a9c, #1d4fc4); }
        .stk::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 1.4mm; background: linear-gradient(90deg, #e8382b, #f47a20); }
        .stk .top { display: flex; align-items: center; justify-content: center; gap: 1.5mm; margin-top: 3.2mm; }
        .stk .top img { width: 9.5mm; height: 9.5mm; }
        .stk .nm { text-align: left; font-weight: 800; font-size: 3.1mm; line-height: 1.15; color: #123a9c; }
        .stk .nm small { display: block; color: #e8382b; font-size: 2.8mm; }
        .stk .tag { margin-top: 1.4mm; font-size: 2.35mm; font-weight: 900; letter-spacing: .1mm; text-transform: uppercase; }
        .stk .qr { width: 28mm; height: 28mm; margin-top: 1.6mm; }
        .stk .qr svg { width: 100%; height: 100%; display: block; }
        .stk .scan { margin-top: 1.8mm; font-size: 2.9mm; font-weight: 800; line-height: 1.22; padding: 0 2mm; }
        .stk .wa { margin-top: 1.2mm; font-size: 2.6mm; font-weight: 800; color: #17803d; }
        .stk .kode { position: absolute; right: 2.2mm; bottom: 2.3mm; font: 1.9mm/1 Consolas, monospace; color: #9aa4ae; }
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .wrap { max-width: none !important; padding: 0 !important; } }
      `}</style>
      <main className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
        <div className="no-print panel" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0 }}>{hanya ? `Cetak stiker · ${p?.nama || ''}` : 'Cetak stiker QR kosong'}</h3>
          <p className="hint" style={{ margin: 0 }}>
            {hanya
              ? 'Stiker untuk unit AC konsumen ini. Tempel di dekat dudukan remote AC.'
              : 'Stiker bernomor yang belum terpasang. Teknisi membawanya ke lokasi, menempelkannya di dekat dudukan remote, lalu scan dari menu Tugas supaya terhubung ke unit AC.'}
            {' '}1 lembar A4 = {PER_LEMBAR} stiker (5 × 7 cm). Saat mencetak, pilih skala <b>100% / Actual size</b> (jangan “Fit to page”) dan nyalakan <b>Background graphics</b>.
          </p>
          {!hanya && (
            <div className="actions" style={{ alignItems: 'center' }}>
              <span className="sm">Buat stiker baru:</span>
              <input className="field" type="number" min={1} max={10} value={lembarBaru} onChange={e => setLembarBaru(Math.min(10, Math.max(1, +e.target.value || 1)))} style={{ width: 64 }} aria-label="Jumlah lembar" />
              <span className="sm">lembar ({lembarBaru * PER_LEMBAR} stiker)</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={buat}>+ Buat nomor stiker</Button>
            </div>
          )}
          {hanya && tanpaKode > 0 && (
            <div className="actions" style={{ alignItems: 'center' }}>
              <span className="sm" style={{ color: 'var(--warn)' }}>{tanpaKode} unit belum punya stiker.</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={beriKode}>Beri nomor stiker</Button>
            </div>
          )}
          {semua.data && <TemplateScan awal={semua.data.settings.templateScan || TEMPLATE_SCAN} onSimpan={() => semua.mutate()} />}
          {loading ? <div className="empty">Memuat data…</div> : items.length ? (
            <>
              <div className="actions" style={{ alignItems: 'center' }}>
                <Button size="sm" variant="outline" onClick={() => setPilih(Object.fromEntries(items.map(x => [x.kode, true])))}>Pilih semua</Button>
                <Button size="sm" variant="outline" onClick={() => setPilih(Object.fromEntries(items.map(x => [x.kode, false])))}>Kosongkan</Button>
                <Button onClick={() => window.print()} disabled={!dipilih.length}>🖨 Cetak {dipilih.length} stiker ({Math.ceil(dipilih.length / PER_LEMBAR)} lembar)</Button>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
                {items.map(x => (
                  <label key={x.kode} className="sm" style={{ display: 'flex', gap: 8, padding: '2px 0', color: 'var(--ink)' }}>
                    <input type="checkbox" checked={pilih[x.kode] ?? true} onChange={e => setPilih(s => ({ ...s, [x.kode]: e.target.checked }))} />
                    <span className="mono">{x.kode}</span> <span className="muted">{x.ket}</span>
                  </label>
                ))}
              </div>
            </>
          ) : <div className="empty">{hanya ? 'Belum ada unit dengan nomor stiker.' : 'Belum ada stiker kosong. Klik “Buat nomor stiker” dulu.'}</div>}
        </div>
        <div className="lembar">
          {dipilih.map(x => (
            <div key={x.kode} className="stk">
              <div className="top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="" />
                <div className="nm">{MEREK}<small>({MEREK_ALIAS})</small></div>
              </div>
              <div className="tag">{TAGLINE}</div>
              <div className="qr" dangerouslySetInnerHTML={{ __html: qr[x.kode] || '' }} />
              <div className="scan">Scan untuk cek jadwal<br />atau chat {MEREK_ALIAS}</div>
              <div className="wa">WA : {WA_USAHA_TAMPIL} (Admin)</div>
              <div className="kode">{x.kode}</div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

/* Pesan WA otomatis saat konsumen scan stiker lalu klik "Chat Aliang AC" (bisa diubah pemilik/admin). */
function TemplateScan({ awal, onSimpan }: { awal: string; onSimpan: () => void }) {
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState(awal);
  const [busy, setBusy] = useState(false);
  const contoh = isiTemplateScan(teks, { kode: 'GT-0015', gedung: 'Gedung Laboratorium', label: 'Ruang Immunologi', noAc: '105', merk: 'Daikin', pk: '2' });
  if (!buka) return <div><Button size="sm" variant="ghost" onClick={() => setBuka(true)}>✏️ Ubah pesan WA saat stiker di-scan</Button></div>;
  return (
    <fieldset className="box">
      <legend>Pesan WA saat konsumen scan stiker</legend>
      <textarea className="field" value={teks} onChange={e => setTeks(e.target.value)} style={{ minHeight: 70 }} />
      <p className="hint" style={{ margin: 0 }}>Kode isian: <span className="mono">{'{lokasi}'}</span> (gedung · ruangan · no. AC), <span className="mono">{'{ruangan}'}</span>, <span className="mono">{'{gedung}'}</span>, <span className="mono">{'{merk}'}</span>, <span className="mono">{'{kode}'}</span>.</p>
      <p className="hint" style={{ margin: 0 }}>Contoh hasil: <i>{contoh}</i></p>
      <div className="actions">
        <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); const r = await saveTemplateScan(teks); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success('Pesan tersimpan'); onSimpan(); setBuka(false); }}>Simpan pesan</Button>
        <Button size="sm" variant="ghost" onClick={() => setTeks(TEMPLATE_SCAN)}>Kembalikan pesan awal</Button>
        <Button size="sm" variant="ghost" onClick={() => setBuka(false)}>Tutup</Button>
      </div>
    </fieldset>
  );
}
