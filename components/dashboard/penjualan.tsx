'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteOrder, simpanPenjualan } from '@/app/actions';
import { fmtD, monthKey, rp } from '@/lib/format';
import { hitungTotal, sisa } from '@/lib/order';
import { totalStok } from '@/lib/stok';
import { METODE, PEMBELI, type AllData, type Metode, type Order, type Pembeli } from '@/lib/types';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { BayarPill } from './order';

/* Jenis order untuk menu penjualan & ringkasan omzet:
   jasa = order service; unit = paket AC baru atau penjualan langsung berisi unit AC; sparepart = penjualan langsung barang lain */
export type JenisOrder = 'jasa' | 'unit' | 'sparepart';
export function jenisOrder(d: Pick<AllData, 'stok'>, o: Order): JenisOrder {
  if (o.jual) return o.parts.some(p => d.stok.find(s => s.id === p.itemId)?.kategori === 'Unit AC') ? 'unit' : 'sparepart';
  return o.items.some(i => i.paket) ? 'unit' : 'jasa';
}
const hargaUntuk = (s: { hargaJual: number; hargaMitra?: number } | undefined, pembeli: Pembeli) =>
  !s ? 0 : pembeli === 'mitra' && s.hargaMitra ? s.hargaMitra : s.hargaJual;

/* Menu "Penjualan Unit AC" / "Penjualan Sparepart" */
export function PenjualanView({ jenis }: { jenis: 'unit' | 'sparepart' }) {
  const { d, open, go } = useDash();
  const [periode, setPeriode] = useState<'bulan' | 'semua'>('bulan');
  const m = d.today.slice(0, 7);
  const list = d.orders
    .filter(o => o.status !== 'Batal' && jenisOrder(d, o) === jenis && (periode === 'semua' || monthKey(o.tanggal) === m))
    .sort((a, b) => (b.tanggal + (b.jam || '')).localeCompare(a.tanggal + (a.jam || '')));
  const bulanIni = d.orders.filter(o => o.status === 'Selesai' && jenisOrder(d, o) === jenis && monthKey(o.tanggal) === m);
  const bon = d.orders.filter(o => o.jual && jenisOrder(d, o) === jenis && o.bayar !== 'Lunas' && o.status !== 'Batal');
  const judul = jenis === 'unit' ? 'Penjualan Unit AC' : 'Penjualan Sparepart';

  return (
    <>
      <div className="section-head">
        <div><h2>{judul}</h2><p>{jenis === 'unit'
          ? 'Paket AC baru (unit + alat + pasang) dari order, dan penjualan unit AC saja tanpa pasang.'
          : 'Penjualan barang langsung (pipa, kabel, sparepart, dll.) tanpa jasa — untuk konsumen atau mitra.'}</p></div>
        <div className="actions">
          <Button onClick={() => open({ kind: 'jual', jenis })}>+ Penjualan langsung</Button>
          {jenis === 'unit' && <Button variant="outline" onClick={() => open({ kind: 'order' })}>+ Order paket AC baru</Button>}
        </div>
      </div>
      <div className="kpis">
        {d.me.peran === 'owner' && <div className="kpi"><span className="lab">Bulan ini</span><span className="val">{rp(bulanIni.reduce((a, o) => a + o.total, 0))}</span><span className="note">{bulanIni.length} transaksi</span></div>}
        <div className={`kpi${bon.length ? ' alert' : ''}`}><span className="lab">Bon belum lunas</span><span className="val">{rp(bon.reduce((a, o) => a + sisa(o), 0))}</span><span className="note">{bon.length} pembeli</span></div>
      </div>
      <div className="toolbar">
        <div className="seg">
          <button aria-pressed={periode === 'bulan'} onClick={() => setPeriode('bulan')}>Bulan ini</button>
          <button aria-pressed={periode === 'semua'} onClick={() => setPeriode('semua')}>Semua</button>
        </div>
      </div>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Tanggal</th><th>Pembeli</th><th>Barang / pekerjaan</th><th className="r">Total</th><th>Bayar</th><th></th></tr></thead>
            <tbody>
              {list.map(o => (
                <tr key={o.id}>
                  <td className="num">{fmtD(o.tanggal)}<div className="sm mono">{o.invoice}</div></td>
                  <td><b>{o.pelanggan}</b>{o.hp && <div className="sm">{o.hp}</div>}
                    <span className={`pill ${o.jual?.pembeli === 'mitra' ? 'accent' : 'brand'}`}>{o.jual ? (o.jual.pembeli === 'mitra' ? 'Mitra' : 'Konsumen') : 'Order paket'}</span></td>
                  <td className="sm">{o.jual ? o.parts.map(p => `${p.nama} ×${p.qty}${p.satuan ? ' ' + p.satuan : ''}`).join(', ') : o.items.filter(i => i.paket).map(i => i.layanan).join(', ')}</td>
                  <td className="r num">{rp(o.total)}</td>
                  <td>{o.jual && o.bayar !== 'Lunas' ? <span className="pill warn">Bon · sisa {rp(sisa(o))}</span> : <BayarPill o={o} today={d.today} />}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="sm" variant="outline" onClick={() => open(o.jual ? { kind: 'jual', id: o.id, jenis } : { kind: 'order', id: o.id })}>Ubah</Button>{' '}
                    <Button size="sm" variant="outline" onClick={() => go('invoice', { invSel: o.id })}>Nota</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="panel empty"><b>Belum ada {judul.toLowerCase()}</b>{periode === 'bulan' ? 'Bulan ini belum ada transaksi.' : 'Klik “+ Penjualan langsung”.'}</div>}
    </>
  );
}

type Baris = { key: number; itemId: string; qty: string; harga: string };
let k = 0;

/* Form penjualan langsung: pembeli konsumen / mitra → harga otomatis; bayar tunai / transfer / QRIS / bon */
export function PenjualanDialog({ id, jenis, onClose }: { id?: string; jenis: 'unit' | 'sparepart'; onClose: () => void }) {
  const { d, run } = useDash();
  const o = id ? d.orders.find(x => x.id === id) : undefined;
  const [pembeli, setPembeli] = useState<Pembeli>(o?.jual?.pembeli || 'konsumen');
  const [nama, setNama] = useState(o?.pelanggan && !['Mitra', 'Konsumen umum'].includes(o.pelanggan) ? o.pelanggan : '');
  const [hp, setHp] = useState(o?.hp || '');
  const [tanggal, setTanggal] = useState(o?.tanggal || d.today);
  const [bayar, setBayar] = useState<Metode | 'Bon'>(o ? (o.pembayaran.length ? o.pembayaran[0].metode : 'Bon') : 'Tunai');
  const [diskon, setDiskon] = useState(o?.diskon ? String(o.diskon) : '');
  const [ket, setKet] = useState(o?.ket || '');
  /* barang unit AC ditaruh di atas untuk menu Penjualan Unit AC */
  const stok = d.stok.slice().sort((a, b) => +((b.kategori === 'Unit AC') === (jenis === 'unit')) - +((a.kategori === 'Unit AC') === (jenis === 'unit')) || a.nama.localeCompare(b.nama));
  const [rows, setRows] = useState<Baris[]>(() => o?.parts.length
    ? o.parts.map(p => ({ key: ++k, itemId: p.itemId, qty: String(p.qty), harga: String(p.harga) }))
    : [{ key: ++k, itemId: '', qty: '1', harga: '' }]);
  const set = (key: number, patch: Partial<Baris>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const gantiPembeli = (p: Pembeli) => { setPembeli(p); setRows(rs => rs.map(r => ({ ...r, harga: r.itemId ? String(hargaUntuk(d.stok.find(s => s.id === r.itemId), p) || '') : r.harga }))); };
  const parts = rows.filter(r => r.itemId).map(r => ({ itemId: r.itemId, qty: +r.qty || 0, harga: +r.harga || 0, nama: '', satuan: '' }));
  const total = hitungTotal([], parts, +diskon || 0);
  const sudahBayar = !!o?.pembayaran.length;

  return (
    <FormDialog title={o ? `Ubah penjualan · ${o.invoice}` : 'Penjualan langsung'} onClose={onClose} submitLabel="Simpan penjualan"
      onSubmit={async () => {
        const r = await simpanPenjualan(o?.id || null, { tanggal, pembeli, nama, hp, ket, diskon: +diskon || 0, bayar, barang: parts.map(p => ({ itemId: p.itemId, qty: p.qty, harga: p.harga })) });
        return run(Promise.resolve(r.ok ? { ok: true as const } : r), o ? 'Penjualan diperbarui' : 'Penjualan tersimpan · stok berkurang');
      }}
      onDelete={o && d.me.peran === 'owner' ? () => run(deleteOrder(o.id), 'Penjualan dihapus · stok kembali') : undefined}>
      <div className="lbl">Pembeli
        <div className="seg" style={{ marginTop: 4, flexWrap: 'wrap' }}>
          {(Object.keys(PEMBELI) as Pembeli[]).map(p => <button type="button" key={p} aria-pressed={pembeli === p} onClick={() => gantiPembeli(p)}>{PEMBELI[p]}</button>)}
        </div>
        <span className="hint">{pembeli === 'mitra' ? 'Harga otomatis memakai harga mitra (teknisi luar / toko / subdealer).' : 'Harga otomatis memakai harga jual konsumen.'}</span>
      </div>
      <div className="grid2">
        <label className="lbl">Nama pembeli {bayar === 'Bon' ? '' : <span className="sm">(opsional)</span>}<input className="field" value={nama} onChange={e => setNama(e.target.value)} required={bayar === 'Bon'} list="namaPembeli" /></label>
        <label className="lbl">No. HP {bayar === 'Bon' ? '' : <span className="sm">(opsional)</span>}<input className="field" inputMode="tel" value={hp} onChange={e => setHp(e.target.value)} required={bayar === 'Bon'} /></label>
        <label className="lbl">Tanggal<input className="field" type="date" value={tanggal} max={d.today} onChange={e => setTanggal(e.target.value)} required /></label>
      </div>
      <datalist id="namaPembeli">{[...new Set(d.orders.filter(x => x.jual?.pembeli === pembeli && x.pelanggan).map(x => x.pelanggan))].slice(0, 50).map(n => <option key={n} value={n} />)}</datalist>

      <fieldset className="box">
        <legend>Barang</legend>
        {rows.map(r => {
          const s = d.stok.find(x => x.id === r.itemId);
          return (
            <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 80px minmax(0,1fr) 34px', gap: 6 }}>
                <select className="field" value={r.itemId} aria-label="Barang" onChange={e => { const x = d.stok.find(y => y.id === e.target.value); set(r.key, { itemId: e.target.value, harga: String(hargaUntuk(x, pembeli) || '') }); }}>
                  <option value="">Pilih barang…</option>
                  {stok.map(x => <option key={x.id} value={x.id}>{x.kategori === 'Unit AC' ? '❄ ' : ''}{x.nama} (sisa {totalStok(x)} {x.satuan})</option>)}
                </select>
                <input className="field" type="number" min={0} step="any" value={r.qty} aria-label="Jumlah" onChange={e => set(r.key, { qty: e.target.value })} />
                <input className="field" type="number" min={0} step={500} value={r.harga} aria-label="Harga satuan" placeholder="Harga" onChange={e => set(r.key, { harga: e.target.value })} />
                <Button type="button" variant="outline" size="icon" aria-label="Hapus baris" disabled={rows.length <= 1} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}>×</Button>
              </div>
              {s && <span className="sm">{s.satuan} · harga konsumen {rp(s.hargaJual)}{s.hargaMitra ? ` · harga mitra ${rp(s.hargaMitra)}` : ' · harga mitra belum diisi'}{totalStok(s) < (+r.qty || 0) ? <b style={{ color: 'var(--bad)' }}> · stok kurang</b> : null}</span>}
            </div>
          );
        })}
        <div><Button type="button" size="sm" variant="outline" disabled={!d.stok.length} onClick={() => setRows(rs => [...rs, { key: ++k, itemId: '', qty: '1', harga: '' }])}>+ Barang</Button></div>
        {!d.stok.length && <p className="hint">Isi daftar barang di menu Stok dulu.</p>}
      </fieldset>

      <div className="grid2">
        <label className="lbl">Potongan harga (Rp)<input className="field" type="number" min={0} step={1000} value={diskon} onChange={e => setDiskon(e.target.value)} /></label>
        <label className="lbl">Keterangan<input className="field" value={ket} onChange={e => setKet(e.target.value)} placeholder="mis. ambil di bengkel" /></label>
      </div>
      {!sudahBayar ? (
        <div className="lbl">Pembayaran
          <div className="seg" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {[...METODE, 'Bon' as const].map(m => <button type="button" key={m} aria-pressed={bayar === m} onClick={() => setBayar(m)}>{m === 'Bon' ? 'Bon (bayar nanti)' : `Lunas · ${m}`}</button>)}
          </div>
          {bayar === 'Bon' && <span className="hint" style={{ color: 'var(--warn)' }}>Masuk piutang. Nama & nomor HP wajib diisi. Pelunasan dicatat di menu Invoice & Pembayaran.</span>}
        </div>
      ) : <p className="hint">Pembayaran sudah tercatat ({o!.pembayaran.map(p => p.metode).join(', ')}). Perubahan pembayaran dilakukan di menu Invoice & Pembayaran.</p>}
      <div className="total-line"><span>Total</span><strong>{rp(total)}</strong></div>
    </FormDialog>
  );
}
