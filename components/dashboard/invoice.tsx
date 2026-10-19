'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { hapusPembayaran, tambahPembayaran } from '@/app/actions';
import { fmtD, fmtLong, rp, waNumber } from '@/lib/format';
import { sisa } from '@/lib/order';
import { METODE, type Metode, type Order, type Settings } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { BayarPill } from './order';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* Satu sumber HTML invoice: dipakai untuk pratinjau, cetak/PDF, dan unduhan. */
function invoiceInner(o: Order, st: Settings) {
  const lines: [string, number, string, number, number][] = [
    ...o.items.map(i => [`${i.layanan}${i.unit ? ' – ' + i.unit : ''}`, i.qty, 'unit', i.harga, i.qty * i.harga] as [string, number, string, number, number]),
    ...(o.parts || []).map(p => [p.nama, p.qty, p.satuan || '', p.harga, p.qty * p.harga] as [string, number, string, number, number]),
  ];
  const lunas = o.bayar === 'Lunas';
  const cap = lunas ? 'LUNAS' : o.bayar === 'Sebagian' ? 'DIBAYAR SEBAGIAN' : 'BELUM LUNAS';
  return `<div class="ph"><div><h4>${esc(st.nama || 'Nama usaha Anda')}</h4><div class="pmuted">${esc(st.alamat || 'Isi alamat di menu Pengaturan')}</div><div class="pmuted">${esc(st.hp || '')}</div></div>
    <div><div class="big">INVOICE</div><div class="mono" style="text-align:right">${esc(o.invoice)}</div><div class="pmuted" style="text-align:right">${fmtLong(o.tanggal)}</div>
    ${!lunas ? `<div class="pmuted" style="text-align:right">Jatuh tempo: <b>${fmtLong(o.jatuhTempo)}</b></div>` : ''}</div></div>
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px"><div><div class="pmuted" style="font-size:.75rem;letter-spacing:.08em;text-transform:uppercase">Kepada</div><b>${esc(o.pelanggan)}</b><div>${esc(o.alamat)}</div><div>${esc(o.hp)}</div></div>
    <div style="align-self:center;color:${lunas ? '#2b7a4b' : '#b23535'}"><span class="stamp">${cap}</span></div></div>
  <div style="overflow-x:auto"><table><thead><tr><th>Keterangan</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${lines.map(l => `<tr><td>${esc(l[0])}</td><td class="r mono">${l[1]} ${esc(l[2])}</td><td class="r mono">${rp(l[3])}</td><td class="r mono">${rp(l[4])}</td></tr>`).join('')}
    ${o.diskon ? `<tr><td colspan="3">Diskon</td><td class="r mono">− ${rp(o.diskon)}</td></tr>` : ''}
    <tr class="tot"><td colspan="3">Total</td><td class="r mono">${rp(o.total)}</td></tr>
    ${o.pembayaran.map(p => `<tr><td colspan="3" class="pmuted">Dibayar ${fmtLong(p.tanggal)} · ${esc(p.metode)}</td><td class="r mono">− ${rp(p.jumlah)}</td></tr>`).join('')}
    ${o.pembayaran.length && !lunas ? `<tr class="tot"><td colspan="3">Sisa tagihan</td><td class="r mono">${rp(sisa(o))}</td></tr>` : ''}
  </tbody></table></div>
  ${o.ket ? `<p class="pmuted" style="margin:12px 0 0"><b>Catatan pekerjaan:</b> ${esc(o.ket)}</p>` : ''}
  ${st.rekening && !lunas ? `<p style="margin:12px 0 0;white-space:pre-wrap"><b>Pembayaran:</b>\n${esc(st.rekening)}</p>` : ''}
  <p class="pmuted" style="margin:16px 0 0">Terima kasih telah menggunakan jasa kami.</p>`;
}

function invoiceFile(o: Order, st: Settings, print: boolean) {
  const css = `body{font:14px/1.5 Arial,sans-serif;color:#1b1b1b;max-width:760px;margin:24px auto;padding:0 20px}.ph{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #b4572b;padding-bottom:12px;margin-bottom:14px}h4{margin:0;font-size:22px;color:#1d5652}.big{font-size:26px;font-weight:700;letter-spacing:.06em;color:#b4572b;text-align:right}.mono{font-family:Consolas,monospace}.pmuted{color:#666}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f2f4f3;font-size:12px;text-transform:uppercase;color:#555}.r{text-align:right}.tot td{font-weight:700;font-size:16px}.stamp{display:inline-block;border:2px solid currentColor;padding:2px 10px;border-radius:4px;font-weight:700;letter-spacing:.08em;transform:rotate(-4deg)}@media print{body{margin:0}}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(o.invoice)}</title><style>${css}</style></head><body>${invoiceInner(o, st)}${print ? '<script>addEventListener("load",()=>{print()})</script>' : ''}</body></html>`;
}

function waText(o: Order, st: Settings) {
  let t = `*INVOICE ${o.invoice}*\n${st.nama || ''}\nTanggal: ${fmtLong(o.tanggal)}\nPelanggan: ${o.pelanggan}\n\n`;
  o.items.forEach(i => (t += `- ${i.layanan}${i.unit ? ' (' + i.unit + ')' : ''}${i.qty > 1 ? ' ' + i.qty + ' unit' : ''}: ${rp(i.qty * i.harga)}\n`));
  (o.parts || []).forEach(p => (t += `- ${p.nama} ${p.qty} ${p.satuan || ''} x ${rp(p.harga)}: ${rp(p.qty * p.harga)}\n`));
  if (o.diskon) t += `- Diskon: -${rp(o.diskon)}\n`;
  t += `\n*Total: ${rp(o.total)}*\n`;
  if (o.bayar === 'Lunas') t += 'Status: LUNAS\n';
  else {
    if (o.dibayar) t += `Sudah dibayar: ${rp(o.dibayar)}\n*Sisa: ${rp(sisa(o))}*\n`;
    t += `Jatuh tempo: ${fmtLong(o.jatuhTempo)}\n`;
    if (st.rekening) t += `\nPembayaran:\n${st.rekening}\n`;
  }
  return t + `\nTerima kasih 🙏`;
}

const fileName = (o: Order) => o.invoice.replace(/\//g, '-');

export function InvoiceView() {
  const { d, run, open, invSel, setInvSel } = useDash();
  const [filter, setFilter] = useState<'Belum lunas' | 'Lunas' | 'Semua'>(invSel ? 'Semua' : 'Belum lunas');
  const t = d.today;
  let list = d.orders.filter(o => o.status !== 'Batal');
  if (filter === 'Belum lunas') list = list.filter(o => o.bayar !== 'Lunas').sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo));
  else {
    if (filter === 'Lunas') list = list.filter(o => o.bayar === 'Lunas');
    list.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.invoice || '').localeCompare(a.invoice || ''));
  }
  const sel = d.orders.find(o => o.id === invSel) || list[0];
  const piutang = d.orders.filter(o => o.status !== 'Batal' && o.bayar !== 'Lunas');
  const piutangSum = piutang.reduce((a, o) => a + sisa(o), 0);
  const lewat = piutang.filter(o => o.jatuhTempo < t);
  const st = d.settings;

  const copyWa = async (o: Order) => {
    const txt = waText(o, st);
    try { await navigator.clipboard.writeText(txt); toast.success('Teks invoice disalin. Tempel di WhatsApp.'); }
    catch { open({ kind: 'text', title: 'Salin teks invoice', text: txt }); }
  };
  const printInv = (o: Order) => {
    const w = window.open('', '_blank');
    if (!w) return toast.error('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');
    w.document.write(invoiceFile(o, st, true));
    w.document.close();
  };
  const download = (o: Order) => {
    const url = URL.createObjectURL(new Blob([invoiceFile(o, st, false)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName(o)}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Invoice &amp; piutang</h2>
          <p>Total piutang: <b className="num">{rp(piutangSum)}</b> dari {piutang.length} invoice
            {lewat.length > 0 && <> · <b style={{ color: 'var(--bad)' }}>{lewat.length} lewat jatuh tempo ({rp(lewat.reduce((a, o) => a + sisa(o), 0))})</b></>}</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg">
          {(['Belum lunas', 'Lunas', 'Semua'] as const).map(x => (
            <button key={x} aria-pressed={filter === x} onClick={() => { setFilter(x); setInvSel(null); }}>{x}</button>
          ))}
        </div>
      </div>
      <div className="inv-layout">
        <div className="panel inv-list">
          {list.length ? list.map(o => {
            const telat = o.bayar !== 'Lunas' && o.jatuhTempo < t;
            return (
              <button key={o.id} className="row" aria-current={sel?.id === o.id} onClick={() => setInvSel(o.id)} style={telat ? { background: 'var(--bad-soft)' } : undefined}>
                <div style={{ minWidth: 0 }}><b>{o.pelanggan}</b><div className="sm mono">{o.invoice} · {fmtD(o.tanggal)}</div>
                  {o.bayar !== 'Lunas' && <div className="sm" style={telat ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>Jatuh tempo {fmtD(o.jatuhTempo)}</div>}</div>
                <div style={{ textAlign: 'right' }}><div className="num">{rp(o.bayar === 'Lunas' ? o.total : sisa(o))}</div><BayarPill o={o} today={t} /></div>
              </button>
            );
          }) : (
            <div className="empty"><b>Tidak ada invoice di sini</b>{filter === 'Belum lunas' ? 'Semua tagihan sudah lunas.' : 'Invoice muncul setelah ada order.'}</div>
          )}
        </div>
        <div>
          {sel && (
            <>
              <div className="actions" style={{ marginBottom: 10 }}>
                {sel.bayar !== 'Lunas' && <Button onClick={() => open({ kind: 'bayar', id: sel.id })}>Catat pembayaran</Button>}
                <Button variant="outline" onClick={() => copyWa(sel)}>Salin teks WhatsApp</Button>
                {waNumber(sel.hp) && (
                  <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/${waNumber(sel.hp)}?text=${encodeURIComponent(waText(sel, st))}`} target="_blank" rel="noopener noreferrer" />}>Kirim ke WA</Button>
                )}
                <Button variant="outline" onClick={() => printInv(sel)}>Cetak / PDF</Button>
                <Button variant="outline" onClick={() => download(sel)}>Unduh</Button>
                <Button variant="outline" onClick={() => open({ kind: 'order', id: sel.id })}>Ubah order</Button>
              </div>
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
              <div className="paper" dangerouslySetInnerHTML={{ __html: invoiceInner(sel, st) }} />
              <p className="hint" style={{ marginTop: 8 }}>“Cetak / PDF” membuka jendela cetak; pilih “Simpan sebagai PDF” untuk membuat file PDF.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function HapusBayar({ onHapus }: { onHapus: () => void }) {
  const [armed, setArmed] = useState(false);
  return <Button size="xs" variant="destructive" onClick={() => (armed ? onHapus() : setArmed(true))}>{armed ? 'Yakin hapus?' : 'Hapus'}</Button>;
}

/* Catat DP / cicilan / pelunasan */
export function BayarDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o = d.orders.find(x => x.id === id);
  const [metode, setMetode] = useState<Metode>('Tunai');
  if (!o) return null;
  const s = sisa(o);
  return (
    <FormDialog wide={false} title={`Catat pembayaran · ${o.invoice}`} submitLabel="Simpan pembayaran" onClose={onClose}
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
