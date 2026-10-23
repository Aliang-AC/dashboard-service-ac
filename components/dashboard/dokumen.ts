/* Dokumen cetak (invoice per order & tagihan rekap) dalam dua model:
   - "biasa": kop modern berwarna (pelanggan perorangan, enak dikirim lewat WA)
   - "resmi": kop surat dengan garis ganda, Kepada Yth., terbilang, tanda tangan (instansi)
   Semua HTML di sini berdiri sendiri (dipakai untuk pratinjau iframe, cetak/PDF, dan unduh). */
import { KOTA, MEREK, MEREK_ALIAS, MEREK_LENGKAP, TAGLINE, WA_USAHA_TAMPIL } from '@/lib/brand';
import { fmtD, fmtLong, fmtMonth, rp } from '@/lib/format';
import { sisa, terbilang, umurPiutang } from '@/lib/order';
import type { Order, Pelanggan, Rekap, Settings } from '@/lib/types';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const br = (s?: string) => esc(s || '').replace(/\n/g, '<br>');

export const DOC_CSS = `
*{box-sizing:border-box}body{font:13px/1.5 Arial,Helvetica,sans-serif;color:#1b2430;max-width:800px;margin:20px auto;padding:0 22px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mono{font-family:Consolas,monospace}.mut{color:#5d6874}.r{text-align:right}
table{width:100%;border-collapse:collapse;margin-top:6px}th,td{padding:7px 8px;border-bottom:1px solid #dfe4ea;text-align:left;vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#5d6874;background:#f3f6fa}td.r,th.r{white-space:nowrap}
.tot td{font-weight:800;font-size:14.5px;border-bottom:0}
.stamp{display:inline-block;border:2.5px solid currentColor;padding:3px 12px;border-radius:5px;font-weight:800;letter-spacing:.08em;transform:rotate(-5deg);font-size:14px}
.lbl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5d6874;font-weight:700}
.sub{font-size:11px;color:#5d6874}
.a-head{margin:0 -22px 16px;padding:18px 22px 16px;background:linear-gradient(135deg,#123a9c,#1d4fc4 65%,#2a66e0);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:14px;position:relative}
.a-head:after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:linear-gradient(90deg,#e8382b,#f47a20)}
.a-brand{display:flex;align-items:center;gap:12px}.a-lg{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.a-lg img{width:48px;height:48px}.a-nm{font-size:18px;font-weight:800;line-height:1.15}.a-nm small{display:block;font-size:13px;color:#ffd1b3}.a-tag{font-size:11px;font-weight:800;margin-top:4px;text-transform:uppercase}
.a-inv{text-align:right}.a-inv .t{font-size:22px;font-weight:900;letter-spacing:.1em}
.a-meta{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.box2{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}.box2>div{flex:1;min-width:200px;background:#f5f8fc;border:1px solid #dfe4ea;border-radius:8px;padding:9px 11px}
.a-foot{margin-top:16px;padding-top:10px;border-top:1px dashed #dfe4ea;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11.5px;color:#5d6874}
.b-kop{display:flex;align-items:center;gap:14px;padding-bottom:9px;border-bottom:3px double #123a9c}
.b-kop img{width:72px;height:72px;flex:none}.b-kop .tx{flex:1;text-align:center}.b-kop .sp{width:72px;flex:none}
.b-kop .nm{font-size:23px;font-weight:900;letter-spacing:.06em;color:#123a9c;line-height:1.1}
.b-kop .nm2{font-size:12.5px;font-weight:800;color:#e8382b;letter-spacing:.04em}.b-kop .al{font-size:11px;color:#5d6874;margin-top:3px}
.b-title{text-align:center;margin:14px 0 2px}.b-title b{font-size:16px;letter-spacing:.14em;text-decoration:underline}
.b-meta{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:12px 0 8px;font-size:12.5px}
.terbilang{margin-top:8px;padding:7px 10px;background:#f5f8fc;border-left:4px solid #1d4fc4;font-style:italic;font-size:12.5px}
.ttd{display:flex;justify-content:space-between;margin-top:22px;gap:20px;break-inside:avoid}.ttd div{width:44%;text-align:center;font-size:12.5px}.ttd .sign{height:72px}
.draf{border:2px dashed #e8382b;color:#c02a1f;text-align:center;font-weight:800;padding:6px;margin-bottom:12px;letter-spacing:.06em}
@media print{body{margin:0}.a-head{margin-top:0}}`;

export const dokumen = (judul: string, isi: string, print: boolean) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(judul)}</title><style>${DOC_CSS}</style></head><body>${isi}${print ? '<script>addEventListener("load",()=>setTimeout(print,300))</script>' : ''}</body></html>`;

const origin = () => (typeof location !== 'undefined' ? location.origin : '');
export const modelInvoice = (o: Pick<Order, 'inv'>, pel?: Pelanggan) => o.inv?.model || (pel?.jenis === 'Instansi' ? 'resmi' : 'biasa');
/* rekening yang dicetak: pilihan di data pelanggan, atau instansi → rekening CV, perorangan → rekening pribadi */
export function rekeningUntuk(st: Settings, pel?: Pelanggan) {
  const pilih = pel?.rekening || (pel?.jenis === 'Instansi' ? 'cv' : 'pribadi');
  return (pilih === 'cv' && st.rekeningInstansi) || st.rekening || '';
}
const alamatUsaha = (st: Settings) => st.alamat || '';

type Baris = { uraian: string; lokasi: string; qty: string; harga: number; jumlah: number };
function barisOrder(o: Order): Baris[] {
  return [
    ...o.items.map(i => ({ uraian: i.layanan, lokasi: i.unit, qty: `${i.qty} unit`, harga: i.harga, jumlah: i.qty * i.harga })),
    ...(o.parts || []).map(p => ({ uraian: p.nama, lokasi: '', qty: `${p.qty} ${p.satuan || ''}`.trim(), harga: p.harga, jumlah: p.qty * p.harga })),
  ];
}
const capBayar = (o: Pick<Order, 'bayar'>) => (o.bayar === 'Lunas' ? 'LUNAS' : o.bayar === 'Sebagian' ? 'DIBAYAR SEBAGIAN' : 'BELUM LUNAS');
const warnaCap = (o: Pick<Order, 'bayar'>) => (o.bayar === 'Lunas' ? '#17803d' : '#c02a1f');
const tempoTeks = (o: Order, today: string) =>
  o.jatuhTempo ? fmtLong(o.jatuhTempo) : `menyesuaikan${o.belumDitagih ? '' : ` (sudah ${umurPiutang(o, today)} hari sejak invoice)`}`;

/* ---------- model biasa (perorangan) ---------- */
function invoiceBiasa(o: Order, st: Settings, pel: Pelanggan | undefined, today: string) {
  const lunas = o.bayar === 'Lunas';
  const rek = rekeningUntuk(st, pel);
  return `${o.belumDitagih ? '<div class="draf">DRAF — INVOICE BELUM DITERBITKAN</div>' : ''}
  <div class="a-head">
    <div class="a-brand"><div class="a-lg"><img src="${origin()}/logo.svg" alt=""></div>
      <div><div class="a-nm">${esc(MEREK)}<small>(${esc(MEREK_ALIAS)})</small></div><div class="a-tag">${esc(TAGLINE)}</div></div></div>
    <div class="a-inv"><div class="t">INVOICE</div><div class="mono">${esc(o.invoice || '(belum terbit)')}</div><div>${fmtLong(o.tglInvoice)}</div></div>
  </div>
  <div class="a-meta">
    <div><div class="lbl">Kepada</div><b style="font-size:14px">${br(o.inv.kepada || o.pelanggan)}</b>${o.inv.kepada ? '' : `<div>${esc(o.alamat)}</div><div>${esc(o.hp)}</div>`}
      ${o.inv.perihal ? `<div class="sub" style="margin-top:4px">Perihal: ${esc(o.inv.perihal)}</div>` : ''}</div>
    <div style="align-self:center;text-align:right;color:${warnaCap(o)}"><span class="stamp">${capBayar(o)}</span>
      ${!lunas && !o.belumDitagih ? `<div class="sub" style="margin-top:8px">Jatuh tempo: <b>${tempoTeks(o, today)}</b></div>` : ''}</div>
  </div>
  <table><thead><tr><th>Pekerjaan</th><th>Lokasi AC</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${barisOrder(o).map(b => `<tr><td>${esc(b.uraian)}</td><td>${esc(b.lokasi) || '<span class="mut">—</span>'}</td><td class="r">${esc(b.qty)}</td><td class="r mono">${rp(b.harga)}</td><td class="r mono">${rp(b.jumlah)}</td></tr>`).join('')}
    ${o.diskon ? `<tr><td colspan="4">Diskon</td><td class="r mono">− ${rp(o.diskon)}</td></tr>` : ''}
    <tr class="tot"><td colspan="4">Total</td><td class="r mono">${rp(o.total)}</td></tr>
    ${o.pembayaran.map(p => `<tr><td colspan="4" class="mut">Dibayar ${fmtLong(p.tanggal)} · ${esc(p.metode)}</td><td class="r mono mut">− ${rp(p.jumlah)}</td></tr>`).join('')}
    ${o.pembayaran.length && !lunas ? `<tr class="tot"><td colspan="4">Sisa tagihan</td><td class="r mono">${rp(sisa(o))}</td></tr>` : ''}
  </tbody></table>
  <div class="box2">
    ${rek && !lunas ? `<div><div class="lbl">Pembayaran transfer</div>${br(rek)}</div>` : ''}
    ${o.ket || o.inv.catatan ? `<div><div class="lbl">Catatan</div>${br([o.ket, o.inv.catatan].filter(Boolean).join('\n'))}</div>` : ''}
  </div>
  <div class="a-foot"><span>Terima kasih telah mempercayakan AC Anda kepada kami.</span><span><b style="color:#17803d">WA : ${WA_USAHA_TAMPIL} (Admin)</b>${alamatUsaha(st) ? ' · ' + esc(alamatUsaha(st)) : ''}</span></div>`;
}

/* ---------- model resmi (instansi): kop surat ---------- */
export function kopResmi(st: Settings) {
  const kontak = [alamatUsaha(st), `WA ${WA_USAHA_TAMPIL} (Admin)`, st.email && 'Email: ' + st.email].filter(Boolean).map(esc).join(' · ');
  return `<div class="b-kop"><img src="${origin()}/logo.svg" alt="">
    <div class="tx"><div class="nm">${esc(MEREK.toUpperCase())}</div><div class="nm2">(${esc(MEREK_ALIAS.toUpperCase())}) · ${esc(TAGLINE.toUpperCase())}</div>
      <div class="al">${kontak}${st.npwp ? `<br>NPWP: ${esc(st.npwp)}` : ''}</div></div><div class="sp"></div></div>`;
}
function ttdResmi(st: Settings, penerima: string, tanggal: string) {
  return `<div class="ttd">
    <div>Diterima oleh,<div class="sign"></div><b>( ........................................ )</b><br>${esc(penerima)}</div>
    <div>${esc(KOTA)}, ${fmtLong(tanggal)}<br>Hormat kami,<div class="sign"></div><b><u>${esc(st.penanggungJawab || '........................................')}</u></b><br>${esc(st.jabatan || 'Direktur')} ${esc(MEREK)}</div>
  </div>`;
}
function invoiceResmi(o: Order, st: Settings, pel: Pelanggan | undefined, today: string) {
  const lunas = o.bayar === 'Lunas';
  const rek = rekeningUntuk(st, pel);
  const kurang = sisa(o);
  return `${o.belumDitagih ? '<div class="draf">DRAF — INVOICE BELUM DITERBITKAN</div>' : ''}${kopResmi(st)}
  <div class="b-title"><b>INVOICE</b><div class="mono">No. ${esc(o.invoice || '(belum terbit)')}</div></div>
  <div class="b-meta">
    <span class="mut">Kepada Yth.</span><span><b>${br(o.inv.kepada || o.pelanggan)}</b>${o.inv.kepada ? '' : `<br>${esc(o.alamat)}`}</span>
    <span class="mut">Tanggal</span><span>${fmtLong(o.tglInvoice)}</span>
    ${o.inv.perihal ? `<span class="mut">Perihal</span><span>${esc(o.inv.perihal)}</span>` : ''}
    ${o.inv.noRef ? `<span class="mut">No. referensi</span><span>${esc(o.inv.noRef)}</span>` : ''}
    ${!lunas ? `<span class="mut">Jatuh tempo</span><span><b>${tempoTeks(o, today)}</b></span>` : ''}
  </div>
  <table><thead><tr><th style="width:30px">No</th><th>Uraian pekerjaan</th><th>Lokasi</th><th class="r">Qty</th><th class="r">Harga satuan</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${barisOrder(o).map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.uraian)}</td><td>${esc(b.lokasi)}</td><td class="r">${esc(b.qty)}</td><td class="r mono">${rp(b.harga)}</td><td class="r mono">${rp(b.jumlah)}</td></tr>`).join('')}
    ${o.diskon ? `<tr><td colspan="5">Diskon</td><td class="r mono">− ${rp(o.diskon)}</td></tr>` : ''}
    <tr class="tot"><td colspan="5">Jumlah tagihan</td><td class="r mono">${rp(o.total)}</td></tr>
    ${o.pembayaran.map(p => `<tr><td colspan="5" class="mut">Dibayar ${fmtLong(p.tanggal)} · ${esc(p.metode)}</td><td class="r mono mut">− ${rp(p.jumlah)}</td></tr>`).join('')}
    ${o.pembayaran.length && !lunas ? `<tr class="tot"><td colspan="5">Sisa tagihan</td><td class="r mono">${rp(kurang)}</td></tr>` : ''}
  </tbody></table>
  <div class="terbilang">Terbilang: <b>${esc(terbilang(o.pembayaran.length && !lunas ? kurang : o.total))}</b></div>
  ${lunas ? `<p style="color:#17803d;margin:10px 0 0"><span class="stamp">LUNAS</span></p>` : rek ? `<p style="margin:12px 0 0;font-size:12.5px">Pembayaran mohon ditransfer ke:<br>${br(rek)}</p>` : ''}
  ${o.ket || o.inv.catatan ? `<p class="mut" style="font-size:11.5px;margin:8px 0 0">${br([o.inv.catatan, o.ket && 'Catatan pekerjaan: ' + o.ket].filter(Boolean).join('\n'))}</p>` : ''}
  ${ttdResmi(st, o.pelanggan, o.tglInvoice)}`;
}

export function invoiceHtml(o: Order, st: Settings, pel: Pelanggan | undefined, today: string) {
  return modelInvoice(o, pel) === 'resmi' ? invoiceResmi(o, st, pel, today) : invoiceBiasa(o, st, pel, today);
}

/* ---------- tagihan gabungan (rekap) — selalu model resmi ---------- */
export function rekapHtml(r: Rekap, orders: Order[], st: Settings, pel: Pelanggan | undefined, h: { total: number; dibayar: number; sisa: number; lunas: boolean }) {
  const rek = rekeningUntuk(st, pel);
  return `${kopResmi(st)}
  <div class="b-title"><b>TAGIHAN</b><div class="mono">No. ${esc(r.nomor)}</div></div>
  <div class="b-meta">
    <span class="mut">Kepada Yth.</span><span><b>${esc(r.pelanggan)}</b>${pel?.alamat ? `<br>${esc(pel.alamat)}` : ''}</span>
    <span class="mut">Tanggal</span><span>${fmtLong(r.tanggal)}</span>
    <span class="mut">Periode</span><span>${esc(fmtMonth(r.bulan))}</span>
    ${!h.lunas ? `<span class="mut">Jatuh tempo</span><span><b>${r.jatuhTempo ? fmtLong(r.jatuhTempo) : 'menyesuaikan'}</b></span>` : ''}
  </div>
  <table><thead><tr><th style="width:30px">No</th><th>Tanggal</th><th>Pekerjaan & lokasi</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${orders.map((o, i) => `<tr><td>${i + 1}</td><td>${fmtD(o.tanggal)}${o.invoice ? `<div class="sub mono">${esc(o.invoice)}</div>` : ''}</td><td>${o.items.map(it => `${esc(it.layanan)}${it.qty > 1 ? ' ×' + it.qty : ''}${it.unit ? ` <span class="sub">— ${esc(it.unit)}</span>` : ''}`).join('<br>')}${o.parts?.length ? `<div class="sub">Bahan: ${o.parts.map(p => esc(`${p.nama} ${p.qty} ${p.satuan || ''}`.trim())).join(', ')}</div>` : ''}</td><td class="r mono">${rp(o.total)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="3">Jumlah tagihan (${orders.length} pekerjaan)</td><td class="r mono">${rp(h.total)}</td></tr>
    ${h.dibayar ? `<tr><td colspan="3" class="mut">Sudah dibayar</td><td class="r mono">− ${rp(h.dibayar)}</td></tr><tr class="tot"><td colspan="3">Sisa tagihan</td><td class="r mono">${rp(h.sisa)}</td></tr>` : ''}
  </tbody></table>
  <div class="terbilang">Terbilang: <b>${esc(terbilang(h.dibayar && !h.lunas ? h.sisa : h.total))}</b></div>
  ${h.lunas ? `<p style="color:#17803d;margin:10px 0 0"><span class="stamp">LUNAS</span></p>` : rek ? `<p style="margin:12px 0 0;font-size:12.5px">Pembayaran mohon ditransfer ke:<br>${br(rek)}</p>` : ''}
  ${ttdResmi(st, r.pelanggan, r.tanggal)}`;
}

/* teks WhatsApp invoice per order */
export function waInvoice(o: Order, st: Settings, pel: Pelanggan | undefined, today: string) {
  let t = `*INVOICE ${o.invoice}*\n${MEREK_LENGKAP}\nTanggal: ${fmtLong(o.tglInvoice)}\nKepada: ${o.pelanggan}\n\n`;
  o.items.forEach(i => (t += `- ${i.layanan}${i.unit ? ' (' + i.unit + ')' : ''}${i.qty > 1 ? ' ' + i.qty + ' unit' : ''}: ${rp(i.qty * i.harga)}\n`));
  (o.parts || []).forEach(p => (t += `- ${p.nama} ${p.qty} ${p.satuan || ''} x ${rp(p.harga)}: ${rp(p.qty * p.harga)}\n`));
  if (o.diskon) t += `- Diskon: -${rp(o.diskon)}\n`;
  t += `\n*Total: ${rp(o.total)}*\n`;
  if (o.bayar === 'Lunas') t += 'Status: LUNAS\n';
  else {
    if (o.dibayar) t += `Sudah dibayar: ${rp(o.dibayar)}\n*Sisa: ${rp(sisa(o))}*\n`;
    if (o.jatuhTempo) t += `Jatuh tempo: ${tempoTeks(o, today)}\n`;
    const rek = rekeningUntuk(st, pel);
    if (rek) t += `\nPembayaran:\n${rek}\n`;
  }
  return t + `\nTerima kasih 🙏\nWA ${WA_USAHA_TAMPIL} (Admin)`;
}
