'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { batalRekap, bayarRekap, buatRekap } from '@/app/actions';
import { addDays, fmtD, fmtLong, fmtMonth, monthKey, rp, waNumber } from '@/lib/format';
import { ringkasItems, sisa } from '@/lib/order';
import { METODE, type AllData, type Metode, type Rekap, type Settings } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { cetakHtml, esc, salinWa, unduhHtml } from './invoice';

/* total/dibayar/sisa rekap dihitung dari order-ordernya */
export function hitungRekap(d: AllData, r: Rekap) {
  const orders = d.orders.filter(o => r.orderIds.includes(o.id)).sort((a, b) => (a.tanggal + a.invoice).localeCompare(b.tanggal + b.invoice));
  const total = orders.reduce((a, o) => a + o.total, 0);
  const dibayar = orders.reduce((a, o) => a + Math.min(o.dibayar, o.total), 0);
  const kurang = orders.reduce((a, o) => a + sisa(o), 0);
  return { orders, total, dibayar, sisa: kurang, lunas: kurang <= 0 };
}

function rekapInner(d: AllData, r: Rekap, st: Settings) {
  const h = hitungRekap(d, r);
  const pel = d.pelanggan.find(p => p.id === r.pelangganId);
  return `<div class="ph"><div><h4>${esc(st.nama || 'Nama usaha Anda')}</h4><div class="pmuted">${esc(st.alamat || '')}</div><div class="pmuted">${esc(st.hp || '')}</div></div>
    <div><div class="big">TAGIHAN BULANAN</div><div class="mono" style="text-align:right">${esc(r.nomor)}</div><div class="pmuted" style="text-align:right">Periode ${esc(fmtMonth(r.bulan))}</div>
    <div class="pmuted" style="text-align:right">Tanggal: ${fmtLong(r.tanggal)}</div>${!h.lunas ? `<div class="pmuted" style="text-align:right">Jatuh tempo: <b>${fmtLong(r.jatuhTempo)}</b></div>` : ''}</div></div>
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px"><div><div class="pmuted" style="font-size:.75rem;letter-spacing:.08em;text-transform:uppercase">Kepada</div><b>${esc(r.pelanggan)}</b><div>${esc(pel?.alamat || '')}</div><div>${esc(pel?.hp || '')}</div></div>
    <div style="align-self:center;color:${h.lunas ? '#2b7a4b' : '#b23535'}"><span class="stamp">${h.lunas ? 'LUNAS' : h.dibayar ? 'DIBAYAR SEBAGIAN' : 'BELUM LUNAS'}</span></div></div>
  <div style="overflow-x:auto"><table><thead><tr><th>Tanggal</th><th>No. invoice</th><th>Pekerjaan</th><th class="r">Jumlah</th></tr></thead><tbody>
    ${h.orders.map(o => `<tr><td>${fmtD(o.tanggal)}</td><td class="mono">${esc(o.invoice)}</td><td>${esc(ringkasItems(o.items))}${o.items.some(i => i.unit) ? `<div class="pmuted" style="font-size:12px">${esc(o.items.map(i => i.unit).filter(Boolean).join(', '))}</div>` : ''}</td><td class="r mono">${rp(o.total)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="3">Total ${h.orders.length} pekerjaan</td><td class="r mono">${rp(h.total)}</td></tr>
    ${h.dibayar ? `<tr><td colspan="3" class="pmuted">Sudah dibayar</td><td class="r mono">− ${rp(h.dibayar)}</td></tr><tr class="tot"><td colspan="3">Sisa tagihan</td><td class="r mono">${rp(h.sisa)}</td></tr>` : ''}
  </tbody></table></div>
  ${st.rekening && !h.lunas ? `<p style="margin:12px 0 0;white-space:pre-wrap"><b>Pembayaran:</b>\n${esc(st.rekening)}</p>` : ''}
  <p class="pmuted" style="margin:16px 0 0">Rincian tiap pekerjaan tersedia pada invoice masing-masing. Terima kasih atas kerja samanya.</p>`;
}

function rekapWa(d: AllData, r: Rekap, st: Settings) {
  const h = hitungRekap(d, r);
  let t = `*TAGIHAN BULANAN ${r.nomor}*\n${st.nama || ''}\nKepada: ${r.pelanggan}\nPeriode: ${fmtMonth(r.bulan)}\n\n`;
  h.orders.forEach(o => (t += `- ${fmtD(o.tanggal)} · ${o.invoice} · ${ringkasItems(o.items)}: ${rp(o.total)}\n`));
  t += `\n*Total: ${rp(h.total)}*\n`;
  if (h.lunas) t += 'Status: LUNAS\n';
  else {
    if (h.dibayar) t += `Sudah dibayar: ${rp(h.dibayar)}\n*Sisa: ${rp(h.sisa)}*\n`;
    t += `Jatuh tempo: ${fmtLong(r.jatuhTempo)}\n`;
    if (st.rekening) t += `\nPembayaran:\n${st.rekening}\n`;
  }
  return t + '\nTerima kasih 🙏';
}

export function RekapView() {
  const { d, open, run } = useDash();
  const [selId, setSelId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const t = d.today, st = d.settings;
  const rows = d.rekap.map(r => ({ r, ...hitungRekap(d, r) })).sort((a, b) => +a.lunas - +b.lunas || b.r.createdAt - a.r.createdAt);
  const sel = rows.find(x => x.r.id === selId) || rows[0];
  const hp = sel ? d.pelanggan.find(p => p.id === sel.r.pelangganId)?.hp : '';

  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        <Button onClick={() => open({ kind: 'rekapBaru' })}>+ Buat rekap bulanan</Button>
        <span className="hint">Gabungkan order instansi dalam satu bulan menjadi satu tagihan.</span>
      </div>
      {rows.length ? (
        <div className="inv-layout">
          <div className="panel inv-list">
            {rows.map(({ r, total, sisa: kurang, lunas }) => {
              const telat = !lunas && r.jatuhTempo < t;
              return (
                <button key={r.id} className="row" aria-current={sel?.r.id === r.id} onClick={() => { setSelId(r.id); setArmed(false); }} style={telat ? { background: 'var(--bad-soft)' } : undefined}>
                  <div style={{ minWidth: 0 }}><b>{r.pelanggan}</b><div className="sm mono">{r.nomor} · {fmtMonth(r.bulan)}</div>
                    {!lunas && <div className="sm" style={telat ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>Jatuh tempo {fmtD(r.jatuhTempo)}</div>}</div>
                  <div style={{ textAlign: 'right' }}><div className="num">{rp(lunas ? total : kurang)}</div>
                    <span className={`pill ${lunas ? 'good' : telat ? 'bad' : 'warn'}`}>{lunas ? 'Lunas' : telat ? 'Lewat tempo' : 'Belum lunas'}</span></div>
                </button>
              );
            })}
          </div>
          <div>
            {sel && (
              <>
                <div className="actions" style={{ marginBottom: 10 }}>
                  {!sel.lunas && <Button onClick={() => open({ kind: 'bayarRekap', id: sel.r.id })}>Catat pembayaran</Button>}
                  <Button variant="outline" onClick={() => { const txt = rekapWa(d, sel.r, st); salinWa(txt, () => open({ kind: 'text', title: 'Salin teks tagihan', text: txt })); }}>Salin teks WhatsApp</Button>
                  {waNumber(hp) && <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/${waNumber(hp)}?text=${encodeURIComponent(rekapWa(d, sel.r, st))}`} target="_blank" rel="noopener noreferrer" />}>Kirim ke WA</Button>}
                  <Button variant="outline" onClick={() => cetakHtml(sel.r.nomor, rekapInner(d, sel.r, st))}>Cetak / PDF</Button>
                  <Button variant="outline" onClick={() => unduhHtml(sel.r.nomor, rekapInner(d, sel.r, st))}>Unduh</Button>
                  {d.me.peran === 'owner' && (
                    <Button variant="destructive" onClick={async () => { if (!armed) return setArmed(true); if (await run(batalRekap(sel.r.id), 'Rekap dibatalkan')) { setSelId(null); setArmed(false); } }}>
                      {armed ? 'Yakin batalkan rekap?' : 'Batalkan rekap'}
                    </Button>
                  )}
                </div>
                <div className="paper" dangerouslySetInnerHTML={{ __html: rekapInner(d, sel.r, st) }} />
                <p className="hint" style={{ marginTop: 8 }}>Pembayaran rekap otomatis dibagi ke order-order di dalamnya, mulai dari yang paling lama. Membatalkan rekap tidak menghapus pembayaran yang sudah tercatat.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="panel empty"><b>Belum ada rekap</b>Untuk pelanggan instansi yang ditagih sebulan sekali, klik “Buat rekap bulanan”.</div>
      )}
    </>
  );
}

/* Buat rekap: pilih pelanggan (instansi) + bulan → order bulan itu yang belum direkap */
export function RekapBaruDialog({ onClose }: { onClose: () => void }) {
  const { d, run } = useDash();
  const bulanLalu = monthKey(addDays(d.today.slice(0, 7) + '-01', -1));
  const instansi = d.pelanggan.filter(p => p.jenis === 'Instansi').sort((a, b) => a.nama.localeCompare(b.nama));
  const daftar = instansi.length ? instansi : d.pelanggan.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const [pid, setPid] = useState(daftar[0]?.id || '');
  const [bulan, setBulan] = useState(bulanLalu);
  const kandidat = useMemo(() => d.orders
    .filter(o => o.pelangganId === pid && monthKey(o.tanggal) === bulan && o.status !== 'Batal' && !o.rekapId)
    .sort((a, b) => (a.tanggal + a.invoice).localeCompare(b.tanggal + b.invoice)), [d.orders, pid, bulan]);
  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const terpilih = (id: string) => pilih[id] ?? kandidat.find(o => o.id === id)?.bayar !== 'Lunas';
  const ids = kandidat.filter(o => terpilih(o.id)).map(o => o.id);
  const total = kandidat.filter(o => terpilih(o.id)).reduce((a, o) => a + o.total, 0);
  const p = d.pelanggan.find(x => x.id === pid);
  const bulanOpsi = [...new Set([d.today.slice(0, 7), bulanLalu, ...d.orders.map(o => monthKey(o.tanggal))])].sort().reverse().slice(0, 18);

  return (
    <FormDialog title="Buat rekap bulanan" submitLabel={`Buat rekap (${ids.length} order)`} onClose={onClose}
      onSubmit={async form => {
        const f = formObj(form);
        const r = await buatRekap(pid, bulan, ids, f.jatuhTempo);
        return run(Promise.resolve(r.ok ? { ok: true as const } : r), 'Rekap dibuat');
      }}>
      <div className="grid2">
        <label className="lbl">Pelanggan {instansi.length ? '(instansi)' : ''}
          <select className="field" value={pid} onChange={e => { setPid(e.target.value); setPilih({}); }}>
            {daftar.map(x => <option key={x.id} value={x.id}>{x.nama}</option>)}
          </select>
        </label>
        <label className="lbl">Bulan
          <select className="field" value={bulan} onChange={e => { setBulan(e.target.value); setPilih({}); }}>
            {bulanOpsi.map(b => <option key={b} value={b}>{fmtMonth(b)}</option>)}
          </select>
        </label>
        <label className="lbl">Jatuh tempo<input className="field" type="date" name="jatuhTempo" required key={pid} defaultValue={addDays(d.today, p?.tempoHari || 30)} /></label>
      </div>
      {!instansi.length && <p className="hint">Belum ada pelanggan berjenis Instansi — ubah jenis pelanggan di tab Pelanggan. Sementara semua pelanggan ditampilkan.</p>}
      <fieldset className="box">
        <legend>Order di {fmtMonth(bulan)} yang belum direkap · {kandidat.length}</legend>
        {kandidat.length ? (
          <ul className="list">
            {kandidat.map(o => (
              <li key={o.id}>
                <input type="checkbox" checked={terpilih(o.id)} onChange={e => setPilih(s => ({ ...s, [o.id]: e.target.checked }))} aria-label={o.invoice} />
                <div className="main"><b className="mono">{o.invoice}</b> · {fmtD(o.tanggal)}<div className="meta">{ringkasItems(o.items)}</div></div>
                <span className="num">{rp(o.total)}</span>{o.bayar === 'Lunas' && <span className="pill good">Lunas</span>}
              </li>
            ))}
          </ul>
        ) : <div className="empty">Tidak ada order di bulan ini untuk pelanggan tersebut.</div>}
      </fieldset>
      <div className="total-line"><span>Total rekap</span><strong>{rp(total)}</strong></div>
    </FormDialog>
  );
}

export function BayarRekapDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const r = d.rekap.find(x => x.id === id);
  const [metode, setMetode] = useState<Metode>('Transfer');
  if (!r) return null;
  const h = hitungRekap(d, r);
  return (
    <FormDialog wide={false} title={`Pembayaran · ${r.nomor}`} submitLabel="Simpan pembayaran" onClose={onClose}
      onSubmit={form => { const f = formObj(form); return run(bayarRekap(r.id, { tanggal: f.tanggal, jumlah: +f.jumlah, metode, ket: f.ket }), 'Pembayaran rekap dicatat'); }}>
      <p>{r.pelanggan} · total <b className="num">{rp(h.total)}</b>{h.dibayar ? <> · sudah dibayar <b className="num">{rp(h.dibayar)}</b></> : null} · sisa <b className="num" style={{ color: 'var(--bad)' }}>{rp(h.sisa)}</b></p>
      <div className="grid2">
        <label className="lbl">Jumlah (Rp)<input className="field" type="number" name="jumlah" min={1} max={h.sisa} required defaultValue={h.sisa} autoFocus /></label>
        <label className="lbl">Tanggal bayar<input className="field" type="date" name="tanggal" required defaultValue={d.today} max={d.today} /></label>
        <div className="lbl span2">Metode
          <div className="seg" style={{ marginTop: 4 }}>{METODE.map(m => <button type="button" key={m} aria-pressed={metode === m} onClick={() => setMetode(m)}>{m}</button>)}</div>
        </div>
        <label className="lbl span2">Keterangan<input className="field" name="ket" placeholder="mis. SP2D no. …, transfer bank …" /></label>
      </div>
      <p className="hint">Uang otomatis dibagi ke order di rekap ini mulai dari yang paling lama.</p>
    </FormDialog>
  );
}
