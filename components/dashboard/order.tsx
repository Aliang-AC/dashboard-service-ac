'use client';
import { totalStok } from '@/lib/stok';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteOrder, saveOrder, setOrderStatus } from '@/app/actions';
import { activeKar, STATUS_CLS } from '@/lib/derive';
import { addDays, fmtD, monthKey, rp } from '@/lib/format';
import { hitungTotal, ringkasItems, sisa, telatBayar } from '@/lib/order';
import { labelUnit } from '@/lib/servis';
import { METODE, STATUS, type AllData, type Metode, type Order, type PaketOrder, type Pelanggan, type Status, type UnitAC } from '@/lib/types';
import { hargaOtomatis, namaPaket, totalPaket, type Tarif } from '@/lib/tarif';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { FotoGaleri } from './tugas';
import { PapanRute, RuteSaya } from './rute';
import { CariOrderLama } from './cari-lama';
import { anggotaTim, namaTim, urutTim } from '@/lib/tim';

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

export function OrderView({ jenis }: { jenis?: 'jasa' }) {
  const { d } = useDash();
  return d.me.peran === 'karyawan' ? <RuteSaya /> : <OrderTable key={jenis || 'semua'} jenis={jenis} />;
}

function OrderTable({ jenis }: { jenis?: 'jasa' }) {
  const { d, open, run, go } = useDash();
  const [tampil, setTampil] = useState<'papan' | 'daftar'>(jenis ? 'daftar' : 'papan');
  const [period, setPeriod] = useState<Period>('bulan');
  const [status, setStatus] = useState<'Semua' | Status>('Semua');
  const [q, setQ] = useState('');

  const t = d.today;
  /* penjualan langsung tidak termasuk jadwal; menu Jasa Service AC hanya order service (tanpa paket AC baru) */
  let list = d.orders.filter(o => !o.jual && (!jenis || !o.items.some(i => i.paket)));
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
        <div><h2>{jenis ? 'Jasa Service AC' : 'Jadwal & Order'}</h2><p>{jenis ? 'Order bersihkan, cuci besar, pasang, bongkar pasang, dan service lainnya.' : 'Semua kunjungan & order teknisi. Sparepart yang dipakai otomatis mengurangi stok.'}</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'order' })}>+ Order baru</Button></div>
      </div>
      {!jenis && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button aria-pressed={tampil === 'papan'} onClick={() => setTampil('papan')}>Papan rute per tim</button>
          <button aria-pressed={tampil === 'daftar'} onClick={() => setTampil('daftar')}>Daftar semua order</button>
        </div>
      )}
      {tampil === 'papan' ? <PapanRute /> : <>
      <CariOrderLama />
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
      <p className="muted" style={{ margin: '0 0 10px' }}>{list.length} order{d.me.peran !== 'karyawan' && <> · omzet selesai <b className="num">{rp(sum)}</b></>}</p>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Pekerjaan</th><th>Teknisi</th><th className="r">Total</th><th>Status</th><th>Bayar</th><th></th></tr></thead>
            <tbody>
              {list.map(o => (
                <tr key={o.id}>
                  <td className="num">{fmtD(o.tanggal)}<div className="sm">{o.jam}</div></td>
                  <td><b>{o.pelanggan}</b><div className="sm">{o.alamat}{o.hp ? ' · ' + o.hp : ''}</div></td>
                  <td>{ringkasItems(o.items)}<div className="sm">{o.items.map(i => i.unit).filter(Boolean).join(', ')}</div>
                    {o.items.some(i => i.perluHarga) && <span className="pill warn">harga belum diisi</span>}</td>
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
      </>}
    </>
  );
}

/* pilihan = 'L:<id layanan>' | 'P:<id paket>' | 'X:<nama lama>' (layanan yang sudah tidak ada di daftar harga) */
type ItemRow = { key: number; pilihan: string; layanan: string; unit: string; qty: string; harga: string; unitId?: string; info?: string; perluHarga?: boolean };

/* isi nama layanan & harga otomatis untuk satu baris dari daftar harga + unit AC yang dipilih */
function hitungBaris(t: Tarif, pilihan: string, u: UnitAC | undefined): Pick<ItemRow, 'layanan' | 'harga' | 'info' | 'perluHarga'> {
  const [jenis, id] = [pilihan.slice(0, 1), pilihan.slice(2)];
  if (jenis === 'P') {
    const pk = t.paket.find(x => x.id === id);
    if (!pk) return { layanan: '', harga: '', info: '', perluHarga: false };
    return { layanan: `${namaPaket(pk)} ${pk.tipe}`, harga: String(totalPaket(pk)), info: `paket: unit ${rp(pk.hargaUnit)} + alat ${rp(pk.hargaAlat)} + jasa ${rp(pk.jasa)}`, perluHarga: false };
  }
  if (jenis === 'L') {
    const l = t.layanan.find(x => x.id === id);
    const h = hargaOtomatis(l, u);
    return { layanan: l?.nama || '', harga: h.harga == null ? '' : String(h.harga), info: h.info, perluHarga: h.harga == null };
  }
  return { layanan: id, harga: '', info: '', perluHarga: false };
}
type PartRow = { key: number; itemId: string; qty: string; harga: string };
let rowKey = 0;

export function OrderDialog({ id, onClose, pelangganId, unitIds, tanggalAwal, timAwal }: { id?: string; onClose: () => void; pelangganId?: string; unitIds?: string[]; tanggalAwal?: string; timAwal?: string }) {
  const { d, run } = useDash();
  const o: Order | undefined = id ? d.orders.find(x => x.id === id) : undefined;
  const t = d.tarif;
  const kar = activeKar(d);
  const stok = d.stok.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const paketAktif = t.paket.filter(x => !x.nonaktif);
  const layDefault = t.layanan.find(x => /bersih|cuci/i.test(x.nama) && x.jenis === 'pk') || t.layanan[0];

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
  const [tanggal, setTanggal] = useState(o?.tanggal || tanggalAwal || d.today);
  const tempoDari = (p: Pelanggan | null, tgl: string) => addDays(tgl, p?.jenis === 'Instansi' ? p.tempoHari || 0 : 0);
  const [jatuhTempo, setJatuhTempo] = useState(o?.jatuhTempo || tempoDari(awal || null, o?.tanggal || d.today));
  const setTanggalTempo = (p: Pelanggan | null, tgl = tanggal) => setJatuhTempo(tempoDari(p, tgl));

  /* pekerjaan, teknisi, sparepart */
  /* baris baru untuk satu unit: layanan bawaan "Bersihkan AC", harga otomatis */
  const barisUnit = (u?: UnitAC): ItemRow => {
    const pilihan = layDefault ? 'L:' + layDefault.id : '';
    return { key: ++rowKey, pilihan, unit: u ? labelUnit(u) : '', qty: '1', unitId: u?.id || '', ...hitungBaris(t, pilihan, u) };
  };
  const [items, setItems] = useState<ItemRow[]>(() => o?.items.length
    ? o.items.map(i => {
        const l = t.layanan.find(x => x.nama === i.layanan);
        const pilihan = i.paket ? 'P:' + i.paket.id : l ? 'L:' + l.id : 'X:' + i.layanan;
        return { key: ++rowKey, pilihan, layanan: i.layanan, unit: i.unit, qty: String(i.qty), harga: i.perluHarga ? '' : String(i.harga), unitId: i.unitId || '', perluHarga: i.perluHarga, info: i.paket ? 'paket (harga saat order dibuat)' : '' };
      })
    : unitIds?.length && awal
      ? (awal.units || []).filter(u => unitIds.includes(u.id)).map(barisUnit)
      : [barisUnit()]);
  const setItem = (key: number, patch: Partial<ItemRow>) => setItems(xs => xs.map(x => (x.key === key ? { ...x, ...patch } : x)));
  const unitPel = (id?: string) => pel?.units?.find(u => u.id === id);
  /* layanan atau unit diganti → hitung ulang harga otomatis (harga yang diketik manual tidak ditimpa kecuali pilihan berubah) */
  const gantiPilihan = (row: ItemRow, pilihan: string) => setItem(row.key, { pilihan, ...hitungBaris(t, pilihan, unitPel(row.unitId)), ...(pilihan.startsWith('P:') && row.unitId && row.unitId !== '__baru' ? { unitId: '__baru', unit: '' } : {}) });
  const gantiUnit = (row: ItemRow, unitId: string) => {
    const u = unitPel(unitId);
    if (unitId === '__baru') return setItem(row.key, { unitId: '__baru', unit: '' });
    setItem(row.key, { unitId, unit: u ? labelUnit(u) : '', ...(row.pilihan.startsWith('L:') ? hitungBaris(t, row.pilihan, u) : {}) });
  };
  const [teknisi, setTeknisi] = useState<string[]>(o?.teknisi || []);
  const [timId, setTimId] = useState(o?.timId || timAwal || '');
  const timTanggal = urutTim(d.tim.find(h => h.id === tanggal)?.tim || [], d.karyawan);
  const timDipilih = timTanggal.find(x => x.id === timId);
  const [parts, setParts] = useState<PartRow[]>((o?.parts || []).map(p => ({ key: ++rowKey, itemId: p.itemId, qty: String(p.qty), harga: String(p.harga) })));
  const setPart = (key: number, patch: Partial<PartRow>) => setParts(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));
  const [diskon, setDiskon] = useState(o?.diskon ? String(o.diskon) : '');
  const [bayarAwal, setBayarAwal] = useState<'' | Metode>('');

  const itemsNum = items.filter(i => i.layanan).map(i => ({
    layanan: i.layanan, unit: i.unit, qty: +i.qty || 1, harga: +i.harga || 0, unitId: i.unitId === '__baru' ? '' : i.unitId || '',
    ...(i.pilihan.startsWith('P:') ? { paket: { id: i.pilihan.slice(2) } as PaketOrder } : {}),
    ...(!i.harga && i.perluHarga ? { perluHarga: true } : {}),
  }));
  const nKosong = items.filter(i => i.layanan && !i.harga && i.perluHarga).length;
  const partsNum = parts.filter(p => p.itemId).map(p => ({ itemId: p.itemId, qty: +p.qty || 0, harga: +p.harga || 0, nama: '', satuan: '' }));
  const total = hitungTotal(itemsNum, partsNum, +diskon || 0);
  const unitOpsi = pel?.units?.map(u => labelUnit(u)) || [];
  const unitAktif = (pel?.units || []).filter(u => !u.nonaktif);

  return (
    <FormDialog
      title={o ? `Ubah order · ${o.invoice || o.pelanggan}` : 'Order baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(saveOrder(o?.id || null, {
          tanggal, jam: f.jam, pelangganId: pel?.id || null, pelanggan: nama, hp, alamat,
          teknisi: timDipilih ? anggotaTim(timDipilih) : teknisi, timId: timDipilih ? timId : '', items: itemsNum, parts: partsNum.map(p => ({ itemId: p.itemId, qty: p.qty, harga: p.harga })),
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
        <legend>Tim / teknisi</legend>
        {timTanggal.length > 0 && (
          <div className="actions">
            {timTanggal.map(x => (
              <button type="button" key={x.id} className={`pill ${timId === x.id ? 'brand' : ''}`} style={{ cursor: 'pointer', padding: '4px 10px' }} onClick={() => setTimId(timId === x.id ? '' : x.id)}>
                {timId === x.id ? '✓ ' : ''}{namaTim(x, d.karyawan)} · {anggotaTim(x).map(a => d.karyawan.find(k => k.id === a)?.nama || '').join(', ')}
              </button>
            ))}
          </div>
        )}
        {timDipilih ? <p className="hint" style={{ margin: 0 }}>Rute masuk ke {namaTim(timDipilih, d.karyawan)} (urutan paling akhir — atur di papan rute).</p> : <>
        {timTanggal.length > 0 ? <p className="hint" style={{ margin: 0 }}>…atau pilih orang satu per satu:</p> : <p className="hint" style={{ margin: 0 }}>Belum ada tim di tanggal ini (atur di Jadwal &amp; Order → Papan rute). Pilih teknisi langsung:</p>}
        <div className="actions">
          {kar.length ? kar.map(k => (
            <label key={k.id} className="pill" style={{ cursor: 'pointer', padding: '4px 10px' }}>
              <input type="checkbox" checked={teknisi.includes(k.id)} style={{ marginRight: 6 }}
                onChange={e => setTeknisi(t => (e.target.checked ? [...t, k.id] : t.filter(x => x !== k.id)))} />{k.nama}
            </label>
          )) : <span className="hint">Tambahkan karyawan di tab Absensi dulu.</span>}
        </div></>}
      </fieldset>

      <fieldset className="box">
        <legend>Pekerjaan</legend>
        <datalist id="unitOpsi">{unitOpsi.map(u => <option key={u} value={u} />)}</datalist>
        {items.map(i => (
          <div key={i.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1.4fr) 60px minmax(0,1fr) 34px', gap: 6, alignItems: 'center' }}>
              <select className="field" aria-label="Layanan" value={i.pilihan} onChange={e => gantiPilihan(i, e.target.value)}>
                {!i.pilihan && <option value="">Pilih layanan…</option>}
                <optgroup label="Layanan">{t.layanan.map(l => <option key={l.id} value={'L:' + l.id}>{l.nama}</option>)}</optgroup>
                {paketAktif.length > 0 && <optgroup label="Paket AC baru">{paketAktif.map(x => <option key={x.id} value={'P:' + x.id}>{namaPaket(x)} {x.tipe} · {rp(totalPaket(x))}</option>)}</optgroup>}
                {i.pilihan.startsWith('X:') && <option value={i.pilihan}>{i.layanan}</option>}
              </select>
              {pel?.units?.length && i.unitId !== '__baru'
                ? <select className="field" aria-label="Unit AC" value={i.unitId && unitPel(i.unitId) ? i.unitId : ''} onChange={e => gantiUnit(i, e.target.value)}>
                    <option value="">— pilih unit —</option>
                    {pel.units.map(u => <option key={u.id} value={u.id}>{labelUnit(u)}{u.inverter ? ' · inverter' : ''}{u.kode ? ` (${u.kode})` : ''}</option>)}
                    <option value="__baru">+ Unit lain / baru (ketik)…</option>
                  </select>
                : <input className="field" list="unitOpsi" aria-label="Unit AC" value={i.unit} placeholder={i.pilihan.startsWith('P:') ? 'Ruangan AC baru, mis. Ruang tamu' : 'Unit, mis. Kamar depan – Daikin 1 PK'} onChange={e => setItem(i.key, { unit: e.target.value, unitId: i.unitId === '__baru' ? '__baru' : '' })} />}
              <input className="field" type="number" min={1} aria-label="Jumlah unit" value={i.qty} onChange={e => setItem(i.key, { qty: e.target.value })} />
              <input className="field" type="number" min={0} step={1000} aria-label="Harga per unit" value={i.harga} placeholder="Isi harga"
                style={!i.harga && i.perluHarga ? { borderColor: 'var(--warn)', background: 'var(--warn-soft)' } : undefined}
                onChange={e => setItem(i.key, { harga: e.target.value, info: '' })} />
              <Button type="button" variant="outline" size="icon" aria-label="Hapus baris" disabled={items.length <= 1} onClick={() => setItems(xs => xs.filter(x => x.key !== i.key))}>×</Button>
            </div>
            {!i.harga && i.perluHarga
              ? <span className="sm" style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠ {i.info || 'Harga diisi manual'} — isi harga setelah dikonfirmasi</span>
              : i.info ? <span className="sm" style={{ color: 'var(--good)' }}>✓ otomatis: {i.info}</span> : null}
          </div>
        ))}
        <div className="actions">
          <Button type="button" size="sm" variant="outline" onClick={() => setItems(xs => [...xs, barisUnit()])}>+ Tambah pekerjaan</Button>
          {unitAktif.length > 1 && <Button type="button" size="sm" variant="outline" onClick={() => setItems(xs => [...xs.filter(x => x.unit || x.unitId), ...unitAktif.filter(u => !xs.some(x => x.unitId === u.id)).map(barisUnit)])}>+ Semua unit pelanggan ini</Button>}
        </div>
        <p className="hint">Pilih layanan & unit AC → harga terisi otomatis dari PK dan tipe (standard / inverter) unit itu, dan tetap bisa diubah. Harga kosong bertanda oranye = diisi manual. Paket AC baru: ketik nama ruangan, unit AC-nya otomatis tercatat di data pelanggan.</p>
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
        <label className="lbl">Potongan harga (Rp)<input className="field" type="number" min={0} step={1000} value={diskon} onChange={e => setDiskon(e.target.value)} /></label>
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
      <div className="total-line"><span>Total</span><strong>{rp(total)}{nKosong > 0 && <span className="pill warn" style={{ marginLeft: 8 }}>+ {nKosong} harga belum diisi</span>}</strong></div>
    </FormDialog>
  );
}
