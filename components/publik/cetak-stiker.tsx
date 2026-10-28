'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import useSWR from 'swr';
import { toast } from 'sonner';
import { beriStikerUnit, buatStikerKosong, daftarStikerKosong, hapusStikerKosong, loadAll, saveTemplateScan } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { MEREK, MEREK_ALIAS, TAGLINE, WA_USAHA_TAMPIL } from '@/lib/brand';
import { isiTemplateScan, lokasiUnit, seriKode, TEMPLATE_SCAN } from '@/lib/unit';

type Item = { kode: string; ket: string; inst?: string };
const PER_LEMBAR = 16;
/* Lembar stiker kertas F4 (215 × 330 mm) tegak, 4 kolom × 4 baris = 16 stiker.
   Stiker umum 50 × 70 mm; stiker khusus instansi (kode seri sendiri, mis. RSUD-0001) 50 × 75 mm.
   Mode "kosong": stiker bernomor yang belum terpasang (?k=<id instansi> = stiker khusus instansi itu).
   Mode "konsumen" (?p=<id>): stiker unit milik satu konsumen. */
export function CetakStiker() {
  const sp = useSearchParams();
  const router = useRouter();
  const hanya = sp.get('p');
  const khusus = hanya ? null : sp.get('k');
  const kosong = useSWR(hanya ? null : ['stiker-kosong', khusus || ''], async () => { const r = await daftarStikerKosong(khusus || undefined); if (!r.ok) throw new Error(r.error); return r.data; });
  const semua = useSWR('stiker-all', async () => { const r = await loadAll(); if (!r.ok) throw new Error(r.error); return r.data; });
  const p = semua.data?.pelanggan.find(x => x.id === (hanya || khusus));
  const namaInst = p?.stikerSeri ? p.stikerNama || p.nama : '';
  const instansi = (semua.data?.pelanggan || []).filter(x => x.stikerSeri);

  const items: Item[] = useMemo(() => hanya
    ? (p?.units || []).filter(u => u.kode && !u.nonaktif).map(u => ({ kode: u.kode!, ket: lokasiUnit(u), inst: namaInst && seriKode(u.kode!) === p?.stikerSeri ? namaInst : undefined }))
    : (kosong.data || []).map(s => ({ kode: s.kode, ket: `dibuat ${new Date(s.dibuatAt).toLocaleDateString('id-ID')}`, inst: khusus ? namaInst || ' ' : undefined })), [hanya, khusus, p, namaInst, kosong.data]);
  const tanpaKode = (p?.units || []).filter(u => !u.kode && !u.nonaktif).length;

  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const [lembarBaru, setLembarBaru] = useState(1);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});
  const dipilih = items.filter(x => pilih[x.kode] ?? true);
  const umum = dipilih.filter(x => !x.inst), inst = dipilih.filter(x => x.inst);
  const perLembar = PER_LEMBAR;
  const maksLembar = 12; // 192 stiker (batas sekali buat 200)
  const jumlahLembar = Math.ceil(umum.length / PER_LEMBAR) + Math.ceil(inst.length / PER_LEMBAR);

  useEffect(() => {
    const origin = location.origin;
    Promise.all(items.map(async x => [x.kode, await QRCode.toString(`${origin}/u/${x.kode}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })] as const))
      .then(r => setQr(Object.fromEntries(r)));
  }, [items]);

  const sisa = items.length % PER_LEMBAR; // stiker di lembar terakhir yang belum penuh
  const lembarList = Array.from({ length: Math.ceil(items.length / PER_LEMBAR) }, (_, i) => items.slice(i * PER_LEMBAR, (i + 1) * PER_LEMBAR));
  const [yakinHapus, setYakinHapus] = useState(false);
  const hapus = async () => {
    if (!yakinHapus) return setYakinHapus(true);
    setBusy(true);
    const r = await hapusStikerKosong(dipilih.map(x => x.kode));
    setBusy(false); setYakinHapus(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.data.jumlah} stiker kosong dihapus.`);
    setPilih({});
    kosong.mutate();
  };
  const buat = async (jumlah = lembarBaru * perLembar) => {
    setBusy(true);
    const r = await buatStikerKosong(jumlah, khusus || undefined);
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
  /* kembali ke halaman sebelumnya (dashboard); kalau dibuka langsung, ke dashboard */
  const kembali = () => { if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back(); else router.replace('/'); };
  const loading = hanya || khusus ? !semua.data || (!hanya && !kosong.data) : !kosong.data;
  const judul = hanya ? `Cetak stiker · ${p?.nama || ''}` : khusus ? `Cetak stiker kosong khusus · ${namaInst}` : 'Cetak stiker QR kosong';

  return (
    <>
      <style>{`
        @page { size: 215mm 330mm; margin: 4mm; }
        .lembar, .lembar-inst { display: grid; grid-template-columns: repeat(4, 50mm); gap: 2mm; justify-content: center; }
        .lembar + .lembar-inst { margin-top: 8mm; }
        .stk { position: relative; width: 50mm; height: 70mm; border: .25mm solid #cfd6df; border-radius: 3mm; overflow: hidden; box-sizing: border-box;
               display: flex; flex-direction: column; align-items: center; background: #fff; color: #14202b; break-inside: avoid;
               -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; text-align: center; }
        .stk.inst { height: 75mm; }
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
        .stk.inst .instnm { margin-top: 3.4mm; width: 44mm; box-sizing: border-box; border-radius: 1.6mm; background: #eef3ff; border: .25mm solid #c9d6f5;
               padding: 1.1mm 1.5mm; font-weight: 900; color: #123a9c; font-size: 2.75mm; line-height: 1.18; }
        .stk.v2 .scan { margin-top: 1.6mm; }
        .stk.v2.gt .scan { margin-top: 4mm; }
        .stk.v2.gt .qr { width: 27mm; height: 27mm; }
        .stk.v2.gt .kodev { left: calc(50% + 14.8mm); }
        .stk.v2 .qrbaris { position: relative; display: flex; justify-content: center; margin-top: 1.6mm; }
        .stk.v2 .qr { width: 25mm; height: 25mm; margin-top: 0; }
        .stk.v2 .kodev { position: absolute; left: calc(50% + 13.8mm); top: 50%; transform: translateY(-50%) rotate(180deg); writing-mode: vertical-rl;
               white-space: nowrap; font: 700 2.3mm/1 Consolas, monospace; color: #123a9c; letter-spacing: .1mm; }
        .stk.v2 .garis { width: 30mm; height: .25mm; background: #dde3ea; margin-top: 1.8mm; }
        .stk.v2 .top { margin-top: 1.4mm; }
        .stk.v2 .tag { margin-top: 1mm; }
        .stk.v2 .wa { margin-top: 1.4mm; }
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .wrap { max-width: none !important; padding: 0 !important; } .lembar + .lembar-inst { margin-top: 0; break-before: page; } }
      `}</style>
      <main className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
        <div className="no-print panel" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><Button size="sm" variant="outline" onClick={kembali}>← Kembali ke dashboard</Button></div>
          <h3 style={{ margin: 0 }}>{judul}</h3>
          {!hanya && instansi.length > 0 && (
            <div className="actions" style={{ alignItems: 'center' }}>
              <span className="sm">Jenis stiker:</span>
              <Button size="sm" variant={khusus ? 'outline' : 'default'} nativeButton={false} render={<Link href="/stiker" replace />}>Umum (GT)</Button>
              {instansi.map(x => <Button key={x.id} size="sm" variant={khusus === x.id ? 'default' : 'outline'} nativeButton={false} render={<Link href={`/stiker?k=${x.id}`} replace />}>{x.stikerNama || x.nama} ({x.stikerSeri})</Button>)}
            </div>
          )}
          {!hanya && semua.data && instansi.length === 0 && (
            <p className="banner" style={{ margin: 0 }}>
              Belum ada stiker khusus instansi (mis. RSUD). Cara mengaktifkan: menu <b>Pelanggan</b> → buka data instansinya (atau <b>+ Konsumen</b>) → Penagihan <b>Instansi</b> →
              isi bagian <b>“Stiker QR khusus instansi”</b> (kode seri &amp; nama di stiker) → <b>Simpan</b>. Setelah itu pilihannya muncul di sini.
            </p>
          )}
          <p className="hint" style={{ margin: 0 }}>
            {hanya
              ? 'Stiker untuk unit AC konsumen ini. Tempel di dekat dudukan remote AC.'
              : khusus
                ? `Stiker bernomor khusus ${namaInst} (kode ${p?.stikerSeri || '…'}-xxxx). Hanya bisa dipasang di instansi ini, lewat Mode Pendataan atau tugas order. Nomor berikutnya otomatis melanjutkan.`
                : 'Stiker bernomor yang belum terpasang. Teknisi membawanya ke lokasi, menempelkannya di dekat dudukan remote, lalu scan dari menu Tugas supaya terhubung ke unit AC.'}
            {' '}1 lembar kertas <b>F4</b> = {PER_LEMBAR} stiker ({khusus ? '5 × 7,5 cm' : '5 × 7 cm'}). Saat mencetak, pilih ukuran kertas <b>F4 / Folio</b>, skala <b>100% / Actual size</b> (jangan “Fit to page”), dan nyalakan <b>Background graphics</b>.
          </p>
          {khusus && p && !p.stikerSeri && <p className="banner" style={{ margin: 0 }}>Instansi ini belum punya kode seri stiker. Atur di data konsumen → “Stiker QR khusus instansi”.</p>}
          {!hanya && (!khusus || p?.stikerSeri) && (
            <div className="actions" style={{ alignItems: 'center' }}>
              <span className="sm">Buat stiker baru:</span>
              <input className="field" type="number" min={1} max={maksLembar} value={lembarBaru} onChange={e => setLembarBaru(Math.min(maksLembar, Math.max(1, +e.target.value || 1)))} style={{ width: 64 }} aria-label="Jumlah lembar" />
              <span className="sm">lembar ({lembarBaru * perLembar} stiker)</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => buat()}>+ Buat nomor stiker</Button>
              {sisa > 0 && !loading && <Button size="sm" variant="outline" disabled={busy} onClick={() => buat(PER_LEMBAR - sisa)}>+ {PER_LEMBAR - sisa} stiker supaya lembar terakhir penuh</Button>}
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
                <Button onClick={() => window.print()} disabled={!dipilih.length}>🖨 Cetak {dipilih.length} stiker ({jumlahLembar} lembar)</Button>
                {!hanya && dipilih.length > 0 && (
                  <Button size="sm" variant={yakinHapus ? 'destructive' : 'ghost'} disabled={busy} onClick={hapus} onBlur={() => setYakinHapus(false)}>
                    {yakinHapus ? `Yakin hapus ${dipilih.length} stiker?` : `🗑 Hapus ${dipilih.length} yang dicentang`}
                  </Button>
                )}
              </div>
              {lembarList.length > 1 && (
                <div className="actions" style={{ alignItems: 'center' }}>
                  <span className="sm">Pilih per lembar:</span>
                  {lembarList.map((l, i) => (
                    <Button key={l[0].kode} size="sm" variant="outline" onClick={() => setPilih(Object.fromEntries(items.map(x => [x.kode, l.includes(x)])))}>
                      {i + 1}: {l[0].kode.split('-')[1]}–{l[l.length - 1].kode.split('-')[1]}{l.length < PER_LEMBAR ? ` (${l.length})` : ''}
                    </Button>
                  ))}
                </div>
              )}
              {!hanya && <p className="hint" style={{ margin: 0 }}>Hapus hanya untuk stiker yang <b>belum dicetak / belum ditempel</b>. Kalau nomor paling akhir yang dihapus, nomor berikutnya ikut mundur sehingga tetap berurutan.</p>}
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
        {umum.length > 0 && (
          <div className="lembar">
            {umum.map(x => (
              <div key={x.kode} className="stk v2 gt">
                <div className="scan">Scan untuk cek jadwal<br />atau Hubungi {MEREK_ALIAS}</div>
                <div className="qrbaris">
                  <div className="qr" dangerouslySetInnerHTML={{ __html: qr[x.kode] || '' }} />
                  <div className="kodev">{x.kode}</div>
                </div>
                <div className="garis" />
                <div className="top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.svg" alt="" />
                  <div className="nm">{MEREK}<small>({MEREK_ALIAS})</small></div>
                </div>
                <div className="tag">{TAGLINE}</div>
                <div className="wa">WA : {WA_USAHA_TAMPIL} (Admin)</div>
              </div>
            ))}
          </div>
        )}
        {inst.length > 0 && (
          <div className="lembar-inst">
            {inst.map(x => (
              <div key={x.kode} className="stk v2 inst">
                <div className="instnm">{x.inst}</div>
                <div className="scan">Scan untuk cek jadwal<br />atau Hubungi {MEREK_ALIAS}</div>
                <div className="qrbaris">
                  <div className="qr" dangerouslySetInnerHTML={{ __html: qr[x.kode] || '' }} />
                  <div className="kodev">{x.kode}</div>
                </div>
                <div className="garis" />
                <div className="top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.svg" alt="" />
                  <div className="nm">{MEREK}<small>({MEREK_ALIAS})</small></div>
                </div>
                <div className="tag">{TAGLINE}</div>
                <div className="wa">WA : {WA_USAHA_TAMPIL} (Admin)</div>
              </div>
            ))}
          </div>
        )}
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
