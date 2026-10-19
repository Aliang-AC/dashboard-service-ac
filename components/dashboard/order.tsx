'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteOrder, saveOrder, setOrderStatus } from '@/app/actions';
import { activeKar, karName, layanan, STATUS_CLS } from '@/lib/derive';
import { addDays, fmtD, monthKey, rp } from '@/lib/format';
import { STATUS, type Order, type Status } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

type Period = 'hari' | 'minggu' | 'bulan' | 'semua';

/* karyawan: hanya jadwal miliknya, tanpa angka uang (sudah disaring di server) */
function JadwalSaya() {
  const { d } = useDash();
  const list = d.orders.filter(o => o.status !== 'Batal' && o.tanggal >= addDays(d.today, -7))
    .sort((a, b) => (a.tanggal + (a.jam || '99')).localeCompare(b.tanggal + (b.jam || '99')));
  return (
    <>
      <div className="section-head"><div><h2>Jadwal saya</h2><p>Order yang ditugaskan ke Anda (7 hari terakhir dan yang akan datang).</p></div></div>
      {list.length ? (
        <ul className="list panel">
          {list.map(o => (
            <li key={o.id} style={o.tanggal === d.today ? { background: 'var(--copper-soft)' } : undefined}>
              <span className="time">{fmtD(o.tanggal)}<br />{o.jam || ''}</span>
              <div className="main">
                <b>{o.pelanggan}</b> · {o.layanan}{o.qtyUnit > 1 ? ` (${o.qtyUnit} unit)` : ''}
                <div className="meta">{o.alamat}{o.hp ? ' · ' + o.hp : ''}{o.unit ? ' · ' + o.unit : ''}</div>
                {o.ket && <div className="meta">{o.ket}</div>}
              </div>
              <span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span>
            </li>
          ))}
        </ul>
      ) : <div className="panel empty"><b>Belum ada jadwal</b>Order yang ditugaskan ke Anda akan muncul di sini.</div>}
    </>
  );
}

export function OrderView() {
  const { d } = useDash();
  return d.me.peran === 'karyawan' ? <JadwalSaya /> : <OrderTable />;
}

function OrderTable() {
  const { d, open, run, go } = useDash();
  const [period, setPeriod] = useState<Period>('bulan');
  const [status, setStatus] = useState<'Semua' | Status>('Semua');
  const [q, setQ] = useState('');

  const t = d.today;
  let list = d.orders.slice();
  if (period === 'hari') list = list.filter(o => o.tanggal === t);
  else if (period === 'minggu') list = list.filter(o => o.tanggal >= addDays(t, -6) && o.tanggal <= addDays(t, 7));
  else if (period === 'bulan') list = list.filter(o => monthKey(o.tanggal) === t.slice(0, 7));
  if (status !== 'Semua') list = list.filter(o => o.status === status);
  const qq = q.trim().toLowerCase();
  if (qq) list = list.filter(o => [o.pelanggan, o.alamat, o.hp, o.layanan, o.invoice, o.unit].join(' ').toLowerCase().includes(qq));
  list.sort((a, b) => (b.tanggal + (b.jam || '')).localeCompare(a.tanggal + (a.jam || '')));
  const sum = list.filter(o => o.status === 'Selesai').reduce((a, o) => a + (+o.total || 0), 0);

  return (
    <>
      <div className="section-head">
        <div><h2>Order &amp; Penjualan</h2><p>Setiap kunjungan service dicatat di sini. Sparepart yang dipakai otomatis mengurangi stok.</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'order' })}>+ Order baru</Button></div>
      </div>
      <div className="toolbar">
        <div className="seg">
          {([['hari', 'Hari ini'], ['minggu', '± 7 hari'], ['bulan', 'Bulan ini'], ['semua', 'Semua']] as [Period, string][]).map(([v, l]) => (
            <button key={v} aria-pressed={period === v} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
        <select className="field" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as Status)} aria-label="Filter status">
          {['Semua', ...STATUS].map(s => <option key={s}>{s}</option>)}
        </select>
        <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, alamat, no. HP, invoice…" />
      </div>
      <p className="muted" style={{ margin: '0 0 10px' }}>{list.length} order{d.me.peran === 'owner' && <> · omzet selesai <b className="num">{rp(sum)}</b></>}</p>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Layanan</th><th>Teknisi</th><th className="r">Total</th><th>Status</th><th>Bayar</th><th></th></tr></thead>
            <tbody>
              {list.map(o => (
                <tr key={o.id}>
                  <td className="num">{fmtD(o.tanggal)}<div className="sm">{o.jam}</div></td>
                  <td><b>{o.pelanggan}</b><div className="sm">{o.alamat}{o.hp ? ' · ' + o.hp : ''}</div></td>
                  <td>{o.layanan}{o.qtyUnit > 1 ? ` ×${o.qtyUnit}` : ''}<div className="sm">{o.unit}</div></td>
                  <td>{karName(d, o.teknisi)}</td>
                  <td className="r num">{rp(o.total)}</td>
                  <td>
                    <select className={`pill ${STATUS_CLS[o.status] || ''}`} value={o.status} aria-label="Status"
                      onChange={e => run(setOrderStatus(o.id, e.target.value as Status), 'Status: ' + e.target.value)}>
                      {STATUS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><span className={`pill ${o.bayar === 'Lunas' ? 'good' : 'warn'}`}>{o.bayar || 'Belum lunas'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="sm" variant="outline" onClick={() => open({ kind: 'order', id: o.id })}>Ubah</Button>{' '}
                    <Button size="sm" variant="outline" onClick={() => go('invoice', { invSel: o.id })}>Invoice</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty"><b>Belum ada order di filter ini</b>Klik “Order baru” untuk mencatat kunjungan pertama, atau ganti periode di atas.</div>
      )}
    </>
  );
}

type PartRow = { key: number; itemId: string; qty: string; harga: string };
let partKey = 0;

export function OrderDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o: Order | undefined = id ? d.orders.find(x => x.id === id) : undefined;
  const lay = layanan(d);
  const kar = activeKar(d);
  const stok = d.stok.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const tarif = (nama: string) => +(lay.find(l => l.nama === nama)?.harga || 0);

  const [lyn, setLyn] = useState(o?.layanan || lay[0]?.nama || '');
  const [qtyUnit, setQtyUnit] = useState(String(o?.qtyUnit || 1));
  const [jasa, setJasa] = useState(o ? String(o.jasa ?? '') : String(tarif(lay[0]?.nama || '') || ''));
  const [touched, setTouched] = useState(!!o);
  const [diskon, setDiskon] = useState(o?.diskon ? String(o.diskon) : '');
  const [parts, setParts] = useState<PartRow[]>((o?.parts || []).map(p => ({ key: ++partKey, itemId: p.itemId, qty: String(p.qty), harga: String(p.harga) })));

  /* Tarif jasa otomatis = tarif layanan × jumlah unit, selama belum diubah manual. */
  const autoJasa = (nama: string, qu: string) => { const h = tarif(nama); if (h) setJasa(String(h * (+qu || 1))); };
  const total = Math.max(0, (+jasa || 0) + parts.reduce((a, p) => a + (+p.qty || 0) * (+p.harga || 0), 0) - (+diskon || 0));
  const setPart = (key: number, patch: Partial<PartRow>) => setParts(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <FormDialog
      title={o ? `Ubah order · ${o.invoice}` : 'Order baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(saveOrder(o?.id || null, {
          tanggal: f.tanggal, jam: f.jam, pelanggan: f.pelanggan, hp: f.hp, alamat: f.alamat, teknisi: f.teknisi,
          layanan: lyn, unit: f.unit, qtyUnit: +qtyUnit || 1, jasa: +jasa || 0, diskon: +diskon || 0,
          parts: parts.map(p => ({ itemId: p.itemId, qty: +p.qty || 0, harga: +p.harga || 0 })),
          status: f.status as Status, bayar: f.bayar as Order['bayar'], metode: f.metode, ket: f.ket,
        }), o ? 'Order diperbarui' : 'Order tersimpan');
      }}
      onDelete={o && d.me.peran === 'owner' ? () => run(deleteOrder(o.id), 'Order dihapus') : undefined}
    >
      <div className="grid2">
        <label className="lbl">Tanggal kunjungan<input className="field" type="date" name="tanggal" required defaultValue={o?.tanggal || d.today} /></label>
        <label className="lbl">Jam<input className="field" type="time" name="jam" defaultValue={o?.jam || ''} /></label>
        <label className="lbl span2">Nama pelanggan<input className="field" name="pelanggan" required defaultValue={o?.pelanggan || ''} placeholder="mis. Ibu Rina" autoFocus /></label>
        <label className="lbl">No. HP / WA<input className="field" name="hp" inputMode="tel" defaultValue={o?.hp || ''} /></label>
        <label className="lbl">Teknisi
          <select className="field" name="teknisi" defaultValue={o?.teknisi || ''}>
            <option value="">—</option>
            {kar.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
        <label className="lbl span2">Alamat<input className="field" name="alamat" defaultValue={o?.alamat || ''} /></label>
        <label className="lbl">Layanan
          <select className="field" value={lyn} onChange={e => { setLyn(e.target.value); setTouched(false); autoJasa(e.target.value, qtyUnit); }}>
            {lay.map(l => <option key={l.nama}>{l.nama}</option>)}
            {o?.layanan && !lay.some(l => l.nama === o.layanan) && <option>{o.layanan}</option>}
          </select>
        </label>
        <label className="lbl">Unit AC<input className="field" name="unit" defaultValue={o?.unit || ''} placeholder="mis. Split 1 PK Daikin" /></label>
        <label className="lbl">Jumlah unit<input className="field" type="number" min={1} value={qtyUnit} onChange={e => { setQtyUnit(e.target.value); if (!touched) autoJasa(lyn, e.target.value); }} /></label>
        <label className="lbl">Biaya jasa total (Rp)<input className="field" type="number" min={0} step={1000} value={jasa} onChange={e => { setJasa(e.target.value); setTouched(true); }} /></label>
      </div>

      <fieldset className="box">
        <legend>Sparepart / bahan dipakai</legend>
        {parts.map(p => (
          <div className="part-row" key={p.key}>
            <select className="field" aria-label="Barang" value={p.itemId}
              onChange={e => { const s = d.stok.find(x => x.id === e.target.value); setPart(p.key, { itemId: e.target.value, harga: p.harga || String(s?.hargaJual || '') }); }}>
              <option value="">Pilih barang…</option>
              {stok.map(s => <option key={s.id} value={s.id}>{s.nama} (sisa {+s.qty || 0} {s.satuan})</option>)}
            </select>
            <input className="field" type="number" min={0} step="any" value={p.qty} onChange={e => setPart(p.key, { qty: e.target.value })} aria-label="Jumlah" />
            <input className="field" type="number" min={0} step={500} value={p.harga} onChange={e => setPart(p.key, { harga: e.target.value })} placeholder="Harga" aria-label="Harga satuan" />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus baris" onClick={() => setParts(ps => ps.filter(x => x.key !== p.key))}>×</Button>
          </div>
        ))}
        <div>
          <Button type="button" size="sm" variant="outline" disabled={!d.stok.length}
            onClick={() => setParts(ps => [...ps, { key: ++partKey, itemId: '', qty: '1', harga: '' }])}>+ Tambah sparepart</Button>
        </div>
        <p className="hint">{d.stok.length ? 'Stok otomatis berkurang saat order disimpan, dan kembali jika order dibatalkan atau dihapus.' : 'Isi daftar barang di menu Stok dulu agar sparepart bisa dipilih.'}</p>
      </fieldset>

      <div className="grid2">
        <label className="lbl">Diskon (Rp)<input className="field" type="number" min={0} step={1000} value={diskon} onChange={e => setDiskon(e.target.value)} /></label>
        <label className="lbl">Status pekerjaan
          <select className="field" name="status" defaultValue={o?.status || 'Terjadwal'}>{STATUS.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="lbl">Pembayaran
          <select className="field" name="bayar" defaultValue={o?.bayar || 'Belum lunas'}>{['Belum lunas', 'Lunas'].map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="lbl">Metode bayar
          <select className="field" name="metode" defaultValue={o?.metode || ''}>{['', 'Tunai', 'Transfer', 'QRIS'].map(s => <option key={s} value={s}>{s || '—'}</option>)}</select>
        </label>
        <label className="lbl span2">Catatan pekerjaan<textarea className="field" name="ket" defaultValue={o?.ket || ''} placeholder="mis. kapasitor outdoor diganti, freon tekanan normal" /></label>
      </div>
      <div className="total-line"><span>Total</span><strong>{rp(total)}</strong></div>
    </FormDialog>
  );
}
