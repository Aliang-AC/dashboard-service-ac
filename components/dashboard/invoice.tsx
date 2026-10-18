'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setPaid } from '@/app/actions';
import { unpaid } from '@/lib/derive';
import { fmtD, fmtLong, rp, waNumber } from '@/lib/format';
import type { Order, Settings } from '@/lib/types';
import { useDash } from './ctx';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* Satu sumber HTML invoice: dipakai untuk pratinjau, cetak/PDF, dan unduhan. */
function invoiceInner(o: Order, st: Settings) {
  const lines: [string, number, string, number, number][] = [
    [`${o.layanan}${o.unit ? ' – ' + o.unit : ''}`, o.qtyUnit || 1, 'unit', (o.jasa || 0) / (o.qtyUnit || 1), o.jasa || 0],
    ...(o.parts || []).map(p => [p.nama, p.qty, p.satuan || '', p.harga, p.qty * p.harga] as [string, number, string, number, number]),
  ];
  const lunas = o.bayar === 'Lunas';
  return `<div class="ph"><div><h4>${esc(st.nama || 'Nama usaha Anda')}</h4><div class="pmuted">${esc(st.alamat || 'Isi alamat di menu Pengaturan')}</div><div class="pmuted">${esc(st.hp || '')}</div></div>
    <div><div class="big">INVOICE</div><div class="mono" style="text-align:right">${esc(o.invoice)}</div><div class="pmuted" style="text-align:right">${fmtLong(o.tanggal)}</div></div></div>
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px"><div><div class="pmuted" style="font-size:.75rem;letter-spacing:.08em;text-transform:uppercase">Kepada</div><b>${esc(o.pelanggan)}</b><div>${esc(o.alamat)}</div><div>${esc(o.hp)}</div></div>
    <div style="align-self:center;color:${lunas ? '#2b7a4b' : '#b23535'}"><span class="stamp">${lunas ? 'LUNAS' : 'BELUM LUNAS'}</span></div></div>
  <div style="overflow-x:auto"><table><thead><tr><th>Keterangan</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${lines.map(l => `<tr><td>${esc(l[0])}</td><td class="r mono">${l[1]} ${esc(l[2])}</td><td class="r mono">${rp(l[3])}</td><td class="r mono">${rp(l[4])}</td></tr>`).join('')}
    ${o.diskon ? `<tr><td colspan="3">Diskon</td><td class="r mono">− ${rp(o.diskon)}</td></tr>` : ''}
    <tr class="tot"><td colspan="3">Total</td><td class="r mono">${rp(o.total)}</td></tr></tbody></table></div>
  ${o.ket ? `<p class="pmuted" style="margin:12px 0 0"><b>Catatan pekerjaan:</b> ${esc(o.ket)}</p>` : ''}
  ${st.rekening ? `<p style="margin:12px 0 0;white-space:pre-wrap"><b>Pembayaran:</b>\n${esc(st.rekening)}</p>` : ''}
  <p class="pmuted" style="margin:16px 0 0">Terima kasih telah menggunakan jasa kami.</p>`;
}

function invoiceFile(o: Order, st: Settings, print: boolean) {
  const css = `body{font:14px/1.5 Arial,sans-serif;color:#1b1b1b;max-width:760px;margin:24px auto;padding:0 20px}.ph{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #b4572b;padding-bottom:12px;margin-bottom:14px}h4{margin:0;font-size:22px;color:#1d5652}.big{font-size:26px;font-weight:700;letter-spacing:.06em;color:#b4572b;text-align:right}.mono{font-family:Consolas,monospace}.pmuted{color:#666}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f2f4f3;font-size:12px;text-transform:uppercase;color:#555}.r{text-align:right}.tot td{font-weight:700;font-size:16px}.stamp{display:inline-block;border:2px solid currentColor;padding:2px 10px;border-radius:4px;font-weight:700;letter-spacing:.08em;transform:rotate(-4deg)}@media print{body{margin:0}}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(o.invoice)}</title><style>${css}</style></head><body>${invoiceInner(o, st)}${print ? '<script>addEventListener("load",()=>{print()})</script>' : ''}</body></html>`;
}

function waText(o: Order, st: Settings) {
  let t = `*INVOICE ${o.invoice}*\n${st.nama || ''}\nTanggal: ${fmtLong(o.tanggal)}\nPelanggan: ${o.pelanggan}\n\n`;
  t += `- ${o.layanan}${o.unit ? ' (' + o.unit + ')' : ''} ${o.qtyUnit > 1 ? o.qtyUnit + ' unit' : ''}: ${rp(o.jasa)}\n`;
  (o.parts || []).forEach(p => (t += `- ${p.nama} ${p.qty} ${p.satuan || ''} x ${rp(p.harga)}: ${rp(p.qty * p.harga)}\n`));
  if (o.diskon) t += `- Diskon: -${rp(o.diskon)}\n`;
  t += `\n*Total: ${rp(o.total)}*\nStatus: ${o.bayar === 'Lunas' ? 'LUNAS' : 'Belum lunas'}\n`;
  if (st.rekening && o.bayar !== 'Lunas') t += `\nPembayaran:\n${st.rekening}\n`;
  return t + `\nTerima kasih 🙏`;
}

const fileName = (o: Order) => o.invoice.replace(/\//g, '-');

export function InvoiceView() {
  const { d, run, open, invSel, setInvSel } = useDash();
  const [filter, setFilter] = useState<'Belum lunas' | 'Lunas' | 'Semua'>(invSel ? 'Semua' : 'Belum lunas');
  let list = d.orders.filter(o => o.status !== 'Batal');
  if (filter === 'Belum lunas') list = list.filter(o => o.bayar !== 'Lunas');
  else if (filter === 'Lunas') list = list.filter(o => o.bayar === 'Lunas');
  list.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.invoice || '').localeCompare(a.invoice || ''));
  const sel = d.orders.find(o => o.id === invSel) || list[0];
  const upSum = unpaid(d).reduce((a, o) => a + (+o.total || 0), 0);
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
        <div><h2>Invoice</h2><p>Invoice dibuat otomatis dari setiap order. Piutang dari pekerjaan selesai: <b className="num">{rp(upSum)}</b>.</p></div>
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
          {list.length ? list.map(o => (
            <button key={o.id} className="row" aria-current={sel?.id === o.id} onClick={() => setInvSel(o.id)}>
              <div style={{ minWidth: 0 }}><b>{o.pelanggan}</b><div className="sm mono">{o.invoice} · {fmtD(o.tanggal)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="num">{rp(o.total)}</div><span className={`pill ${o.bayar === 'Lunas' ? 'good' : 'warn'}`}>{o.bayar || 'Belum lunas'}</span></div>
            </button>
          )) : (
            <div className="empty"><b>Tidak ada invoice di sini</b>{filter === 'Belum lunas' ? 'Semua tagihan sudah lunas.' : 'Invoice muncul setelah ada order.'}</div>
          )}
        </div>
        <div>
          {sel && (
            <>
              <div className="actions" style={{ marginBottom: 10 }}>
                {sel.bayar !== 'Lunas'
                  ? <Button onClick={() => run(setPaid(sel.id, true), 'Ditandai lunas')}>Tandai lunas</Button>
                  : <Button variant="outline" onClick={() => run(setPaid(sel.id, false), 'Status bayar dikembalikan')}>Batalkan lunas</Button>}
                <Button variant="outline" onClick={() => copyWa(sel)}>Salin teks WhatsApp</Button>
                {waNumber(sel.hp) && (
                  <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/${waNumber(sel.hp)}?text=${encodeURIComponent(waText(sel, st))}`} target="_blank" rel="noopener noreferrer" />}>Kirim ke WA</Button>
                )}
                <Button variant="outline" onClick={() => printInv(sel)}>Cetak / PDF</Button>
                <Button variant="outline" onClick={() => download(sel)}>Unduh</Button>
                <Button variant="outline" onClick={() => open({ kind: 'order', id: sel.id })}>Ubah order</Button>
              </div>
              <div className="paper" dangerouslySetInnerHTML={{ __html: invoiceInner(sel, st) }} />
              <p className="hint" style={{ marginTop: 8 }}>“Cetak / PDF” membuka jendela cetak; pilih “Simpan sebagai PDF” untuk membuat file PDF.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
