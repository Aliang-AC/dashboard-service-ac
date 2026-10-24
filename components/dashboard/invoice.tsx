'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { hapusPembayaran, simpanInfoInvoice, tambahPembayaran, terbitkanInvoice } from '@/app/actions';
import { addDays, fmtD, rp, waNumber } from '@/lib/format';
import { sisa, telatBayar, umurPiutang } from '@/lib/order';
import { METODE, type AllData, type Metode, type Order } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { dokumen, esc as escDok, invoiceHtml, modelInvoice, waInvoice } from './dokumen';
import { FormDialog } from './form-dialog';
import { BayarPill } from './order';
import { RekapView } from './rekap';
import { CariOrderLama } from './cari-lama';

export const esc = escDok;

/* dokumen sederhana (mis. daftar unit AC) */
const PRINT_CSS = `body{font:14px/1.5 Arial,sans-serif;color:#1b1b1b;max-width:760px;margin:24px auto;padding:0 20px}.ph{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #1d4fc4;padding-bottom:12px;margin-bottom:14px}h4{margin:0;font-size:20px;color:#123a9c}.mono{font-family:Consolas,monospace}.pmuted{color:#666}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f2f4f3;font-size:11px;text-transform:uppercase;color:#555}.r{text-align:right}@media print{body{margin:0}}`;
const dokumenSederhana = (judul: string, isi: string, print: boolean) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(judul)}</title><style>${PRINT_CSS}</style></head><body>${isi}${print ? '<script>addEventListener("load",()=>{print()})</script>' : ''}</body></html>`;
function tulisJendela(html: string) {
  const w = window.open('', '_blank');
  if (!w) return toast.error('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');
  w.document.write(html);
  w.document.close();
}
export const cetakHtml = (judul: string, isi: string) => tulisJendela(dokumenSederhana(judul, isi, true));
function unduh(judul: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${judul.replace(/\//g, '-')}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* invoice & tagihan (kop biasa / resmi) */
export const cetakDok = (judul: string, isi: string) => tulisJendela(dokumen(judul, isi, true));
export const unduhDok = (judul: string, isi: string) => unduh(judul, dokumen(judul, isi, false));
export async function salinWa(txt: string, fallback: () => void) {
  try { await navigator.clipboard.writeText(txt); toast.success('Teks disalin. Tempel di WhatsApp.'); }
  catch { fallback(); }
}

/* pratinjau dokumen di dalam iframe (gaya cetak terpisah dari gaya dashboard) */
export function Pratinjau({ isi, judul }: { isi: string; judul: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const pas = () => { const f = ref.current; const h = f?.contentDocument?.documentElement.scrollHeight; if (f && h) f.style.height = h + 24 + 'px'; };
  useEffect(() => { const t = [100, 500, 1500].map(ms => setTimeout(pas, ms)); return () => t.forEach(clearTimeout); }, [isi]);
  return (
    <iframe ref={ref} title={judul} srcDoc={dokumen(judul, isi, false)} className="paper" onLoad={pas}
      style={{ width: '100%', minHeight: 400, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: 0 }} />
  );
}

const pelOf = (d: AllData, o: Order) => d.pelanggan.find(p => p.id === o.pelangganId);
type Filter = 'Belum ditagih' | 'Belum lunas' | 'Lunas' | 'Semua';

export function InvoiceView() {
  const { d, run, open, invSel, setInvSel } = useDash();
  const t = d.today;
  const aktif = d.orders.filter(o => o.status !== 'Batal');
  const belumTagih = aktif.filter(o => o.belumDitagih && !o.rekapId);
  const [filter, setFilter] = useState<Filter>(invSel ? 'Semua' : belumTagih.length ? 'Belum ditagih' : 'Belum lunas');
  const [mode, setMode] = useState<'order' | 'rekap'>('order');
  let list = aktif;
  if (filter === 'Belum ditagih') list = belumTagih.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  else if (filter === 'Belum lunas') list = aktif.filter(o => !o.belumDitagih && o.bayar !== 'Lunas').sort((a, b) => (a.jatuhTempo || '9999').localeCompare(b.jatuhTempo || '9999') || a.tglInvoice.localeCompare(b.tglInvoice));
  else {
    if (filter === 'Lunas') list = aktif.filter(o => o.bayar === 'Lunas');
    list = list.slice().sort((a, b) => (b.tglInvoice || '').localeCompare(a.tglInvoice || '') || (b.invoice || '').localeCompare(a.invoice || ''));
  }
  const sel = d.orders.find(o => o.id === invSel) || list[0];
  const piutang = aktif.filter(o => !o.belumDitagih && o.bayar !== 'Lunas');
  const piutangSum = piutang.reduce((a, o) => a + sisa(o), 0);
  const lewat = piutang.filter(o => telatBayar(o, t));
  const st = d.settings;

  const copyWa = (o: Order) => { const txt = waInvoice(o, st, pelOf(d, o), t); salinWa(txt, () => open({ kind: 'text', title: 'Salin teks invoice', text: txt })); };
  const judul = (o: Order) => o.invoice || `Draf invoice ${o.pelanggan}`;
  const isiInv = (o: Order) => invoiceHtml(o, st, pelOf(d, o), t);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Invoice &amp; piutang</h2>
          <p>Total piutang: <b className="num">{rp(piutangSum)}</b> dari {piutang.length} invoice
            {lewat.length > 0 && <> · <b style={{ color: 'var(--bad)' }}>{lewat.length} lewat jatuh tempo ({rp(lewat.reduce((a, o) => a + sisa(o), 0))})</b></>}
            {belumTagih.length > 0 && <> · <b style={{ color: 'var(--warn)' }}>{belumTagih.length} pekerjaan belum ditagih ({rp(belumTagih.reduce((a, o) => a + sisa(o), 0))})</b></>}</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg">
          <button aria-pressed={mode === 'order'} onClick={() => setMode('order')}>Per order</button>
          <button aria-pressed={mode === 'rekap'} onClick={() => setMode('rekap')}>Tagihan gabungan (rekap){d.rekap.length ? ` · ${d.rekap.length}` : ''}</button>
        </div>
        {mode === 'order' && (
          <div className="seg">
            {(['Belum ditagih', 'Belum lunas', 'Lunas', 'Semua'] as const).map(x => (
              <button key={x} aria-pressed={filter === x} onClick={() => { setFilter(x); setInvSel(null); }}>{x}{x === 'Belum ditagih' && belumTagih.length ? ` · ${belumTagih.length}` : ''}</button>
            ))}
          </div>
        )}
      </div>
      {mode === 'order' && <CariOrderLama />}
      {mode === 'rekap' ? <RekapView /> : <div className="inv-layout">
        <div className="panel inv-list">
          {list.length ? list.map(o => {
            const telat = telatBayar(o, t);
            return (
              <button key={o.id} className="row" aria-current={sel?.id === o.id} onClick={() => setInvSel(o.id)} style={telat ? { background: 'var(--bad-soft)' } : undefined}>
                <div style={{ minWidth: 0 }}><b>{o.pelanggan}</b><div className="sm mono">{o.invoice || 'belum ditagih'} · {fmtD(o.belumDitagih ? o.tanggal : o.tglInvoice)}</div>
                  {o.rekapId && <div className="sm">dalam rekap {d.rekap.find(r => r.id === o.rekapId)?.nomor || ''}</div>}
                  {o.belumDitagih ? <div className="sm" style={{ color: 'var(--warn)' }}>Kerja {o.status.toLowerCase()} · {umurPiutang({ tglInvoice: o.tanggal }, t)} hari lalu</div>
                    : o.bayar !== 'Lunas' && <div className="sm" style={telat ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{o.jatuhTempo ? `Jatuh tempo ${fmtD(o.jatuhTempo)}` : `Tempo belum pasti · ${umurPiutang(o, t)} hari`}</div>}</div>
                <div style={{ textAlign: 'right' }}><div className="num">{rp(o.bayar === 'Lunas' ? o.total : sisa(o))}</div>
                  {o.belumDitagih ? <span className="pill warn">Belum ditagih</span> : <BayarPill o={o} today={t} />}</div>
              </button>
            );
          }) : (
            <div className="empty"><b>Tidak ada invoice di sini</b>{filter === 'Belum lunas' ? 'Semua tagihan sudah lunas.' : filter === 'Belum ditagih' ? 'Semua pekerjaan instansi sudah ditagih.' : 'Invoice muncul setelah ada order.'}</div>
          )}
        </div>
        <div>
          {sel && (
            <>
              <div className="actions" style={{ marginBottom: 10 }}>
                {sel.belumDitagih ? (
                  <>
                    <Button onClick={() => open({ kind: 'terbit', id: sel.id })}>Terbitkan invoice</Button>
                    <Button variant="outline" onClick={() => setMode('rekap')}>Gabungkan ke tagihan rekap</Button>
                  </>
                ) : (
                  <>
                    {sel.bayar !== 'Lunas' && <Button onClick={() => open({ kind: 'bayar', id: sel.id })}>Catat pembayaran</Button>}
                    <Button variant="outline" onClick={() => copyWa(sel)}>Salin teks WhatsApp</Button>
                    {waNumber(sel.hp) && (
                      <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/${waNumber(sel.hp)}?text=${encodeURIComponent(waInvoice(sel, st, pelOf(d, sel), t))}`} target="_blank" rel="noopener noreferrer" />}>Kirim ke WA</Button>
                    )}
                  </>
                )}
                <Button variant="outline" onClick={() => cetakDok(judul(sel), isiInv(sel))}>Cetak / PDF</Button>
                <Button variant="outline" onClick={() => unduhDok(judul(sel), isiInv(sel))}>Unduh</Button>
                <Button variant="outline" onClick={() => open({ kind: 'infoInvoice', id: sel.id })}>Ubah isian invoice</Button>
                <Button variant="ghost" onClick={() => open({ kind: 'order', id: sel.id })}>Ubah order</Button>
              </div>
              {sel.belumDitagih && <p className="banner" style={{ marginTop: 0 }}>Pekerjaan ini belum ditagih. Saat instansi siap menerima tagihan, klik <b>Terbitkan invoice</b> (nomor invoice dibuat saat itu), atau gabungkan beberapa pekerjaan ke satu <b>tagihan rekap</b>.</p>}
              {modelInvoice(sel, pelOf(d, sel)) === 'resmi' && sel.total > 5_000_000 && <p className="banner" style={{ marginTop: 0 }}>Total di atas Rp5 juta: siapkan materai di Berita Acara (BA).</p>}
              {sel.pembayaran.length > 0 && (
                <div className="panel" style={{ marginBottom: 10 }}>
                  <h3>Riwayat pembayaran</h3>
                  <ul className="list">
                    {sel.pembayaran.map(p => (
                      <li key={p.id}>
                        <span className="time">{fmtD(p.tanggal)}</span>
                        <div className="main"><b className="num">{rp(p.jumlah)}</b> · {p.metode}<div className="meta">{[p.ket, p.oleh && 'dicatat ' + p.oleh].filter(Boolean).join(' · ')}</div></div>
                        {d.me.peran === 'owner' && <HapusBayar onHapus={() => run(hapusPembayaran(sel.id, p.id), 'Pembayaran dihapus')} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Pratinjau key={sel.id + sel.updatedAt} judul={judul(sel)} isi={isiInv(sel)} />
              <p className="hint" style={{ marginTop: 8 }}>
                Model: <b>{modelInvoice(sel, pelOf(d, sel)) === 'resmi' ? 'resmi (kop surat)' : 'biasa'}</b> — ganti lewat “Ubah isian invoice”.
                {sel.inv.diubah?.length ? ` Terakhir diubah ${sel.inv.diubah[sel.inv.diubah.length - 1].oleh}, ${new Date(sel.inv.diubah[sel.inv.diubah.length - 1].at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}.` : ''}
                {' '}“Cetak / PDF” membuka jendela cetak; pilih “Simpan sebagai PDF” untuk membuat file PDF.
              </p>
            </>
          )}
        </div>
      </div>}
    </>
  );
}

function HapusBayar({ onHapus }: { onHapus: () => void }) {
  const [armed, setArmed] = useState(false);
  return <Button size="xs" variant="destructive" onClick={() => (armed ? onHapus() : setArmed(true))}>{armed ? 'Yakin hapus?' : 'Hapus'}</Button>;
}

/* Pilihan tempo saat menerbitkan / mengubah invoice: 30 / 60 / 90 hari, tanggal tertentu, atau belum pasti */
function PilihTempo({ dari, value, onChange }: { dari: string; value: string; onChange: (v: string) => void }) {
  const opsi = [30, 60, 90];
  return (
    <div className="lbl">Jatuh tempo
      <div className="seg" style={{ marginTop: 4, flexWrap: 'wrap' }}>
        {opsi.map(n => <button type="button" key={n} aria-pressed={value === addDays(dari, n)} onClick={() => onChange(addDays(dari, n))}>{n} hari</button>)}
        <button type="button" aria-pressed={value === ''} onClick={() => onChange('')}>Belum pasti</button>
      </div>
      <input className="field" type="date" value={value} min={dari} onChange={e => onChange(e.target.value)} style={{ marginTop: 6 }} aria-label="Tanggal jatuh tempo" />
      <span className="hint">{value ? `Jatuh tempo ${fmtD(value)}.` : 'Tempo belum pasti: dashboard menampilkan berapa hari sejak invoice diterbitkan.'}</span>
    </div>
  );
}

/* Terbitkan invoice untuk pekerjaan yang belum ditagih */
export function TerbitDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o = d.orders.find(x => x.id === id);
  const [tgl, setTgl] = useState(d.today);
  const [jt, setJt] = useState('');
  if (!o) return null;
  return (
    <FormDialog wide={false} title={`Terbitkan invoice · ${o.pelanggan}`} submitLabel="Terbitkan" onClose={onClose}
      onSubmit={async () => {
        const r = await terbitkanInvoice(o.id, tgl, jt);
        return run(Promise.resolve(r.ok ? { ok: true as const } : r), r.ok ? `Invoice ${r.data.invoice} diterbitkan` : '');
      }}>
      <p style={{ margin: 0 }}>Pekerjaan {fmtD(o.tanggal)} · total <b className="num">{rp(o.total)}</b></p>
      <label className="lbl">Tanggal invoice<input className="field" type="date" value={tgl} onChange={e => { setTgl(e.target.value); if (jt && jt < e.target.value) setJt(''); }} required /></label>
      <PilihTempo dari={tgl} value={jt} onChange={setJt} />
      <p className="hint" style={{ margin: 0 }}>Nomor invoice dibuat otomatis menurut bulan tanggal invoice. Isian Kepada Yth., perihal, dan no. referensi bisa diatur lewat “Ubah isian invoice”.</p>
    </FormDialog>
  );
}

/* Ubah isian invoice: model kop, Kepada Yth./u.p., perihal, no. referensi, catatan, tanggal & jatuh tempo */
export function InfoInvoiceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o = d.orders.find(x => x.id === id);
  const pel = o ? pelOf(d, o) : undefined;
  const [model, setModel] = useState<'biasa' | 'resmi'>(o ? modelInvoice(o, pel) : 'biasa');
  const [tgl, setTgl] = useState(o?.tglInvoice || d.today);
  const [jt, setJt] = useState(o?.jatuhTempo || '');
  if (!o) return null;
  const kunci = o.bayar === 'Lunas' && d.me.peran !== 'owner';
  return (
    <FormDialog title={`Isian invoice · ${o.invoice || 'draf'}`} onClose={onClose} submitLabel={kunci ? 'Tutup' : 'Simpan'}
      onSubmit={kunci ? undefined : form => {
        const f = formObj(form);
        return run(simpanInfoInvoice(o.id, { model, kepada: f.kepada, perihal: f.perihal, noRef: f.noRef, catatan: f.catatan, tglInvoice: o.belumDitagih ? '' : tgl, jatuhTempo: jt }), 'Isian invoice disimpan');
      }}>
      {kunci && <p className="banner" style={{ margin: 0 }}>Invoice ini sudah lunas — hanya pemilik yang bisa mengubahnya.</p>}
      <div className="lbl">Model invoice
        <div className="seg" style={{ marginTop: 4 }}>
          <button type="button" aria-pressed={model === 'biasa'} onClick={() => setModel('biasa')}>Biasa (kop berwarna)</button>
          <button type="button" aria-pressed={model === 'resmi'} onClick={() => setModel('resmi')}>Resmi (kop surat)</button>
        </div>
        <span className="hint">Bawaan: instansi → resmi, perorangan → biasa. Bisa diganti per invoice.</span>
      </div>
      <div className="grid2">
        <label className="lbl span2">Kepada Yth. / u.p. <span className="sm">(kosong = nama & alamat pelanggan)</span>
          <textarea className="field" name="kepada" defaultValue={o.inv.kepada || ''} placeholder={'mis. Direktur RSUD Sintang\nu.p. Bagian Pemeliharaan Sarana'} style={{ minHeight: 60 }} />
        </label>
        <label className="lbl">Perihal / pekerjaan<input className="field" name="perihal" defaultValue={o.inv.perihal || ''} placeholder="mis. Servis berkala AC Gedung Laboratorium" /></label>
        <label className="lbl">No. referensi <span className="sm">(SPK / surat / nota dinas)</span><input className="field" name="noRef" defaultValue={o.inv.noRef || ''} /></label>
        {!o.belumDitagih && <label className="lbl">Tanggal invoice<input className="field" type="date" value={tgl} onChange={e => setTgl(e.target.value)} /></label>}
        {!o.belumDitagih && <div className="span2"><PilihTempo dari={tgl} value={jt} onChange={setJt} /></div>}
        <label className="lbl span2">Catatan di invoice<textarea className="field" name="catatan" defaultValue={o.inv.catatan || ''} placeholder="mis. Rincian per unit AC terlampir." style={{ minHeight: 60 }} /></label>
      </div>
      {o.belumDitagih && <p className="hint" style={{ margin: 0 }}>Tanggal & jatuh tempo diisi saat invoice diterbitkan.</p>}
      {!!o.inv.diubah?.length && <p className="hint" style={{ margin: 0 }}>Riwayat ubah: {o.inv.diubah.slice(-5).map(x => `${x.oleh} (${new Date(x.at).toLocaleDateString('id-ID')})`).join(', ')}</p>}
    </FormDialog>
  );
}

/* Catat DP / cicilan / pelunasan */
export function BayarDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o = d.orders.find(x => x.id === id);
  const [metode, setMetode] = useState<Metode>('Tunai');
  if (!o) return null;
  const s = sisa(o);
  return (
    <FormDialog wide={false} title={`Catat pembayaran · ${o.invoice || o.pelanggan}`} submitLabel="Simpan pembayaran" onClose={onClose}
      onSubmit={form => { const f = formObj(form); return run(tambahPembayaran(o.id, { tanggal: f.tanggal, jumlah: +f.jumlah, metode, ket: f.ket }), 'Pembayaran dicatat'); }}>
      <p>{o.pelanggan} · total <b className="num">{rp(o.total)}</b>{o.dibayar ? <> · sudah dibayar <b className="num">{rp(o.dibayar)}</b></> : null} · sisa <b className="num" style={{ color: 'var(--bad)' }}>{rp(s)}</b></p>
      <div className="grid2">
        <label className="lbl">Jumlah (Rp)<input className="field" type="number" name="jumlah" min={1} max={s} required defaultValue={s} autoFocus /></label>
        <label className="lbl">Tanggal bayar<input className="field" type="date" name="tanggal" required defaultValue={d.today} max={d.today} /></label>
        <div className="lbl span2">Metode
          <div className="seg" style={{ marginTop: 4 }}>
            {METODE.map(m => <button type="button" key={m} aria-pressed={metode === m} onClick={() => setMetode(m)}>{m}</button>)}
          </div>
        </div>
        <label className="lbl span2">Keterangan<input className="field" name="ket" placeholder="mis. DP, pelunasan, transfer BCA a.n. …" /></label>
      </div>
      <p className="hint">Isi kurang dari sisa untuk DP / cicilan. Status otomatis jadi Lunas kalau sisa = 0.</p>
    </FormDialog>
  );
}
