'use client';
import { totalStok } from '@/lib/stok';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteOrder, saveOrder, setOrderStatus } from '@/app/actions';
import { activeKar, layanan, STATUS_CLS } from '@/lib/derive';
import { addDays, fmtD, monthKey, rp } from '@/lib/format';
import { hitungTotal, ringkasItems, sisa, telatBayar } from '@/lib/order';
import { labelUnit } from '@/lib/servis';
import { METODE, STATUS, type AllData, type Metode, type Order, type Pelanggan, type Status } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { FotoGaleri } from './tugas';

type Period = 'hari' | 'minggu' | 'bulan' | 'semua';

export const namaTeknisi = (d: AllData, ids: string[]) => ids.map(id => d.karyawan.find(k => k.id === id)?.nama || '').filter(Boolean).join(', ');
export const mapsUrl = (alamat: string, maps?: string) =>
  maps || (alamat ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alamat)}` : '');

/* status bayar: Lunas / Sebagian (sisa) / Belum dibayar; merah kalau lewat jatuh tempo */
export function BayarPill({ o, today }: { o: Order; today: string }) {
  if (o.bayar === 'Lunas') return <span className="pill good">Lunas</span>;
  if (o.belumDitagih) return <span className="pill warn">Belum ditagih</span>;
  const telat = telatBayar(o, today);
  const teks = o.bayar === 'Sebagian' ? `Sebagian · sisa ${rp(sisa(o))}` : 'Belum dibayar';
  return <span className={`pill ${telat ? 'bad' : o.bayar === 'Sebagian' ? 'accent' : 'warn'}`}>{teks}{telat ? ' · lewat tempo' : ''}</span>;
}

/* karyawan: hanya jadwal miliknya, tanpa angka uang (sudah disaring di server) */
function JadwalSaya() {
  const { d, open } = useDash();
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
                <b>{o.pelanggan}</b>
                {o.items.map((i, n) => <div key={n} className="meta">• {i.layanan}{i.qty > 1 ? ` ×${i.qty}` : ''}{i.unit ? ` — ${i.unit}` : ''}</div>)}
                <div className="meta">{o.alamat}{o.hp ? ' · ' + o.hp : ''}</div>
                {o.ket && <div className="meta">{o.ket}</div>}
                <div className="actions" style={{ marginTop: 6 }}>
                  <Button size="sm" onClick={() => open({ kind: 'tugas', id: o.id })}>Buka tugas</Button>
                  {o.alamat && <a className="linkbtn" href={mapsUrl(o.alamat)} target="_blank" rel="noopener noreferrer">📍 Maps</a>}
                  {o.foto.length > 0 && <span className="sm">📷 {o.foto.length} foto</span>}
                </div>
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
  if (qq) list = list.filter(o => [o.pelanggan, o.alamat, o.hp, o.invoice, ...o.items.map(i => i.layanan + ' ' + i.unit)].join(' ').toLowerCase().includes(qq));
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
        <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, alamat, no. HP, invoice, layanan…" />
      </div>
      <p className="muted" style={{ margin: '0 0 10px' }}>{list.length} order{d.me.peran === 'owner' && <> · omzet selesai <b className="num">{rp(sum)}</b></>}</p>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Pekerjaan</th><th>Teknisi</th><th className="r">Total</th><th>Status</th><th>Bayar</th><th></th></tr></thead>
            <tbody>
              {list.map(o => (
                <tr key={o.id}>
                  <td className="num">{fmtD(o.tanggal)}<div className="sm">{o.jam}</div></td>
                  <td><b>{o.pelanggan}</b><div className="sm">{o.alamat}{o.hp ? ' · ' + o.hp : ''}</div></td>
                  <td>{ringkasItems(o.items)}<div className="sm">{o.items.map(i => i.unit).filter(Boolean).join(', ')}</div></td>
                  <td>{namaTeknisi(d, o.teknisi)}</td>
                  <td className="r num">{rp(o.total)}</td>
                  <td>
                    <select className={`pill ${STATUS_CLS[o.status] || ''}`} value={o.status} aria-label="Status"
                      onChange={e => run(setOrderStatus(o.id, e.target.value as Status), 'Status: ' + e.target.value)}>
                      {STATUS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><BayarPill o={o} today={t} /></td>
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

type ItemRow = { key: number; layanan: string; unit: string; qty: string; harga: string; unitId?: string };
type PartRow = { key: number; itemId: string; qty: string; harga: string };
let rowKey = 0;

export function OrderDialog({ id, onClose, pelangganId, unitIds }: { id?: string; onClose: () => void; pelangganId?: string; unitIds?: string[] }) {
  const { d, run } = useDash();
  const o: Order | undefined = id ? d.orders.find(x => x.id === id) : undefined;
  const lay = layanan(d);
  const kar = activeKar(d);
  const stok = d.stok.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const tarif = (nama: string) => +(lay.find(l => l.nama === nama)?.harga || 0);

  /* pelanggan */
  const awal = d.pelanggan.find(p => p.id === (o?.pelangganId || pelangganId));
  const [pel, setPel] = useState<Pelanggan | null>(awal || null);
  const [nama, setNama] = useState(o?.pelanggan || awal?.nama || '');
  const [hp, setHp] = useState(o?.hp || awal?.hp || '');
  const [alamat, setAlamat] = useState(o?.alamat || awal?.alamat || '');
  const [cariFokus, setCariFokus] = useState(false);
  const saran = useMemo(() => {
    const qq = nama.trim().toLowerCase();
    if (pel || qq.length < 2) return [];
    return d.pelanggan.filter(p => [p.nama, p.hp].join(' ').toLowerCase().includes(qq)).slice(0, 6);
  }, [nama, pel, d.pelanggan]);
  const pilih = (p: Pelanggan) => {
    setPel(p); setNama(p.nama); setHp(p.hp || hp); setAlamat(p.alamat || alamat); setCariFokus(false);
    if (!o) setTanggalTempo(p);
  };

  /* jadwal & jatuh tempo */
  const [tanggal, setTanggal] = useState(o?.tanggal || d.today);
  const tempoDari = (p: Pelanggan | null, tgl: string) => addDays(tgl, p?.jenis === 'Instansi' ? p.tempoHari || 0 : 0);
  const [jatuhTempo, setJatuhTempo] = useState(o?.jatuhTempo || tempoDari(awal || null, o?.tanggal || d.today));
  const setTanggalTempo = (p: Pelanggan | null, tgl = tanggal) => setJatuhTempo(tempoDari(p, tgl));

  /* pekerjaan, teknisi, sparepart */
  const [items, setItems] = useState<ItemRow[]>(o?.items.length
    ? o.items.map(i => ({ key: ++rowKey, layanan: i.layanan, unit: i.unit, qty: String(i.qty), harga: String(i.harga), unitId: i.unitId || '' }))
    : unitIds?.length && awal
      /* order untuk sekumpulan unit (mis. satu gedung): satu baris per unit, layanan bawaan "Cuci AC" */
      ? (awal.units || []).filter(u => unitIds.includes(u.id)).map(u => {
          const l = lay.find(x => /cuci/i.test(x.nama))?.nama || lay[0]?.nama || '';
          return { key: ++rowKey, layanan: l, unit: labelUnit(u), qty: '1', harga: String(tarif(l) || ''), unitId: u.id };
        })
      : [{ key: ++rowKey, layanan: lay[0]?.nama || '', unit: '', qty: '1', harga: String(tarif(lay[0]?.nama || '') || '') }]);
  const setItem = (key: number, patch: Partial<ItemRow>) => setItems(xs => xs.map(x => (x.key === key ? { ...x, ...patch } : x)));
  const [teknisi, setTeknisi] = useState<string[]>(o?.teknisi || []);
  const [parts, setParts] = useState<PartRow[]>((o?.parts || []).map(p => ({ key: ++rowKey, itemId: p.itemId, qty: String(p.qty), harga: String(p.harga) })));
  const setPart = (key: number, patch: Partial<PartRow>) => setParts(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));
  const [diskon, setDiskon] = useState(o?.diskon ? String(o.diskon) : '');
  const [bayarAwal, setBayarAwal] = useState<'' | Metode>('');

  const itemsNum = items.map(i => ({ layanan: i.layanan, unit: i.unit, qty: +i.qty || 1, harga: +i.harga || 0, unitId: i.unitId === '__baru' ? '' : i.unitId || '' }));
  const partsNum = parts.filter(p => p.itemId).map(p => ({ itemId: p.itemId, qty: +p.qty || 0, harga: +p.harga || 0, nama: '', satuan: '' }));
  const total = hitungTotal(itemsNum, partsNum, +diskon || 0);
  const unitOpsi = pel?.units?.map(u => labelUnit(u)) || [];

  return (
    <FormDialog
      title={o ? `Ubah order · ${o.invoice || o.pelanggan}` : 'Order baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(saveOrder(o?.id || null, {
          tanggal, jam: f.jam, pelangganId: pel?.id || null, pelanggan: nama, hp, alamat,
          teknisi, items: itemsNum, parts: partsNum.map(p => ({ itemId: p.itemId, qty: p.qty, harga: p.harga })),
          diskon: +diskon || 0, status: f.status as Status, ket: f.ket, jatuhTempo, bayarAwal: o ? null : bayarAwal || null,
        }), o ? 'Order diperbarui' : 'Order tersimpan');
      }}
      onDelete={o && d.me.peran === 'owner' ? () => run(deleteOrder(o.id), 'Order dihapus') : undefined}
    >
      <fieldset className="box">
        <legend>Pelanggan</legend>
        <div className="grid2">
          <label className="lbl span2" style={{ position: 'relative' }}>Nama pelanggan / instansi
            <input className="field" required value={nama} placeholder="Ketik nama atau no. HP untuk mencari…" autoFocus={!o}
              onFocus={() => setCariFokus(true)} onBlur={() => setTimeout(() => setCariFokus(false), 150)}
              onChange={e => { setNama(e.target.value); if (pel) setPel(null); }} />
            {cariFokus && saran.length > 0 && (
              <div className="panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, padding: 4, marginTop: 4 }}>
                {saran.map(p => (
                  <button type="button" key={p.id} className="linkbtn" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', color: 'var(--ink)' }}
                    onMouseDown={e => e.preventDefault()} onClick={() => pilih(p)}>
                    <b>{p.nama}</b> <span className="sm">{p.hp}{p.jenis === 'Instansi' ? ' · Instansi' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          {pel
            ? <p className="hint span2" style={{ marginTop: -6 }}>✓ Pelanggan terdaftar{pel.jenis === 'Instansi' ? ` · Instansi, tempo ${pel.tempoHari} hari` : ''} · <button type="button" className="linkbtn" onClick={() => setPel(null)}>bukan ini</button></p>
            : nama.trim().length >= 2 && <p className="hint span2" style={{ marginTop: -6 }}>Pelanggan baru: otomatis disimpan ke daftar Pelanggan saat order disimpan.</p>}
          <label className="lbl">No. HP / WA<input className="field" inputMode="tel" value={hp} onChange={e => setHp(e.target.value)} /></label>
          <label className="lbl">Alamat<input className="field" value={alamat} onChange={e => setAlamat(e.target.value)} /></label>
        </div>
      </fieldset>

      <div className="grid2">
        <label className="lbl">Tanggal kunjungan<input className="field" type="date" required value={tanggal}
          onChange={e => { setTanggal(e.target.value); if (!o && e.target.value) setTanggalTempo(pel, e.target.value); }} /></label>
        <label className="lbl">Jam<input className="field" type="time" name="jam" defaultValue={o?.jam || ''} /></label>
      </div>

      <fieldset className="box">
        <legend>Teknisi (boleh lebih dari satu)</legend>
        <div className="actions">
          {kar.length ? kar.map(k => (
            <label key={k.id} className="pill" style={{ cursor: 'pointer', padding: '4px 10px' }}>
              <input type="checkbox" checked={teknisi.includes(k.id)} style={{ marginRight: 6 }}
                onChange={e => setTeknisi(t => (e.target.checked ? [...t, k.id] : t.filter(x => x !== k.id)))} />{k.nama}
            </label>
          )) : <span className="hint">Tambahkan karyawan di tab Absensi dulu.</span>}
        </div>
      </fieldset>

      <fieldset className="box">
        <legend>Pekerjaan</legend>
        <datalist id="unitOpsi">{unitOpsi.map(u => <option key={u} value={u} />)}</datalist>
        {items.map(i => (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1.4fr) 60px minmax(0,1fr) 34px', gap: 6, alignItems: 'center' }}>
            <select className="field" aria-label="Layanan" value={i.layanan}
              onChange={e => setItem(i.key, { layanan: e.target.value, harga: String(tarif(e.target.value) || i.harga) })}>
              {lay.map(l => <option key={l.nama}>{l.nama}</option>)}
              {i.layanan && !lay.some(l => l.nama === i.layanan) && <option>{i.layanan}</option>}
            </select>
            {pel?.units?.length && i.unitId !== '__baru'
              ? <select className="field" aria-label="Unit AC" value={i.unitId && pel.units.some(u => u.id === i.unitId) ? i.unitId : ''}
                  onChange={e => { const u = pel.units.find(x => x.id === e.target.value); setItem(i.key, e.target.value === '__baru' ? { unitId: '__baru', unit: '' } : { unitId: e.target.value, unit: u ? labelUnit(u) : '' }); }}>
                  <option value="">— pilih unit —</option>
                  {pel.units.map(u => <option key={u.id} value={u.id}>{labelUnit(u)}{u.kode ? ` (${u.kode})` : ''}</option>)}
                  <option value="__baru">+ Unit lain (ketik)…</option>
                </select>
              : <input className="field" list="unitOpsi" aria-label="Unit AC" value={i.unit} placeholder="Unit, mis. Kamar depan – Daikin 1 PK" onChange={e => setItem(i.key, { unit: e.target.value, unitId: i.unitId === '__baru' ? '__baru' : '' })} />}
            <input className="field" type="number" min={1} aria-label="Jumlah unit" value={i.qty} onChange={e => setItem(i.key, { qty: e.target.value })} />
            <input className="field" type="number" min={0} step={1000} aria-label="Harga per unit" value={i.harga} placeholder="Harga" onChange={e => setItem(i.key, { harga: e.target.value })} />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus baris" disabled={items.length <= 1} onClick={() => setItems(xs => xs.filter(x => x.key !== i.key))}>×</Button>
          </div>
        ))}
        <div><Button type="button" size="sm" variant="outline" onClick={() => setItems(xs => [...xs, { key: ++rowKey, layanan: lay[0]?.nama || '', unit: '', qty: '1', harga: String(tarif(lay[0]?.nama || '') || '') }])}>+ Tambah pekerjaan</Button></div>
        <p className="hint">Kolom: layanan · unit AC (lokasi/merk/PK) · jumlah · harga per unit. Unit yang diketik otomatis tersimpan di data pelanggan.</p>
      </fieldset>

      <fieldset className="box">
        <legend>Sparepart / bahan dipakai</legend>
        {parts.map(p => (
          <div className="part-row" key={p.key}>
            <select className="field" aria-label="Barang" value={p.itemId}
              onChange={e => { const s = d.stok.find(x => x.id === e.target.value); setPart(p.key, { itemId: e.target.value, harga: p.harga || String(s?.hargaJual || '') }); }}>
              <option value="">Pilih barang…</option>
              {stok.map(s => <option key={s.id} value={s.id}>{s.nama} (sisa {totalStok(s)} {s.satuan})</option>)}
            </select>
            <input className="field" type="number" min={0} step="any" value={p.qty} onChange={e => setPart(p.key, { qty: e.target.value })} aria-label="Jumlah" />
            <input className="field" type="number" min={0} step={500} value={p.harga} onChange={e => setPart(p.key, { harga: e.target.value })} placeholder="Harga" aria-label="Harga satuan" />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus baris" onClick={() => setParts(ps => ps.filter(x => x.key !== p.key))}>×</Button>
          </div>
        ))}
        <div>
          <Button type="button" size="sm" variant="outline" disabled={!d.stok.length}
            onClick={() => setParts(ps => [...ps, { key: ++rowKey, itemId: '', qty: '1', harga: '' }])}>+ Tambah sparepart</Button>
        </div>
        <p className="hint">{d.stok.length ? 'Stok otomatis berkurang saat order disimpan, dan kembali jika order dibatalkan atau dihapus.' : 'Isi daftar barang di menu Stok dulu agar sparepart bisa dipilih.'}</p>
      </fieldset>

      <div className="grid2">
        <label className="lbl">Diskon (Rp)<input className="field" type="number" min={0} step={1000} value={diskon} onChange={e => setDiskon(e.target.value)} /></label>
        <label className="lbl">Status pekerjaan
          <select className="field" name="status" defaultValue={o?.status || 'Terjadwal'}>{STATUS.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        {!o ? (
          <label className="lbl">Pembayaran saat ini
            <select className="field" value={bayarAwal} onChange={e => setBayarAwal(e.target.value as '' | Metode)}>
              <option value="">Belum dibayar / bayar nanti</option>
              {METODE.map(m => <option key={m} value={m}>Lunas · {m}</option>)}
            </select>
          </label>
        ) : (
          <div className="lbl">Pembayaran<div style={{ paddingTop: 6 }}><BayarPill o={o} today={d.today} /> <span className="hint">dicatat di tab Invoice</span></div></div>
        )}
        {(o ? o.belumDitagih : pel?.jenis === 'Instansi')
          ? <div className="lbl">Penagihan<span className="hint" style={{ paddingTop: 6 }}>Instansi: invoice diterbitkan belakangan dari tab Invoice (nomor & jatuh tempo diisi saat itu).</span></div>
          : <label className="lbl">Jatuh tempo bayar <span className="sm">(kosong = belum pasti)</span><input className="field" type="date" value={jatuhTempo} min={tanggal} onChange={e => setJatuhTempo(e.target.value)} /></label>}
        <label className="lbl span2">Catatan pekerjaan<textarea className="field" name="ket" defaultValue={o?.ket || ''} placeholder="mis. kapasitor outdoor diganti, freon tekanan normal" /></label>
      </div>
      {o?.catatanTeknisi && <fieldset className="box"><legend>Laporan teknisi</legend><p className="sm" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.catatanTeknisi}</p></fieldset>}
      {o && <FotoGaleri o={o} bisaTambah />}
      <div className="total-line"><span>Total</span><strong>{rp(total)}</strong></div>
    </FormDialog>
  );
}
