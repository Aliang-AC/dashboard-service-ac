'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { catatPengingat, hapusPelanggan, orderPelangganLengkap, savePelanggan } from '@/app/actions';
import { STATUS_CLS } from '@/lib/derive';
import { fmtD, fmtLong, rp, waNumber } from '@/lib/format';
import { ringkasItems, sisa } from '@/lib/order';
import { jadwalUnit, labelUnit, perluDihubungi, type UnitJatuhTempo } from '@/lib/servis';
import { JENIS_PELANGGAN, TIPE_LOKASI, type AllData, type Pelanggan, type UnitAC } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { BayarPill, mapsUrl } from './order';
import { DatalistUnit, GedungEditor, keUnitRows, UnitKartu, UnitPerGedung, unitRowBaru, type UnitRow } from './unit-admin';

/* order milik pelanggan: lewat pelangganId, atau (order lama) nama yang sama */
export const orderPelanggan = (d: AllData, p: Pelanggan) =>
  d.orders.filter(o => o.pelangganId === p.id || (!o.pelangganId && o.pelanggan.trim().toLowerCase() === p.nama.trim().toLowerCase()));

export function infoServis(d: AllData, p: Pelanggan) {
  const os = orderPelanggan(d, p);
  const jadwal = (p.units || []).map(u => jadwalUnit(u, os, p.intervalBulan));
  const terakhir = [...jadwal.map(j => j.terakhir), ...os.filter(o => o.status === 'Selesai').map(o => o.tanggal)].filter(Boolean).sort().pop() || '';
  const berikut = jadwal.map(j => j.berikut).filter(Boolean).sort()[0] || '';
  const piutang = os.filter(o => o.status !== 'Batal').reduce((a, o) => a + sisa(o), 0);
  return { os, terakhir, berikut, piutang };
}

export const perluDiingatkan = (d: AllData, p: Pelanggan) => !!perluDihubungi(p, d.orders, d.today);

export const TEMPLATE_PENGINGAT =
  'Halo {nama}, kami dari {usaha}. Sudah waktunya cuci AC untuk: {unit}. Servis terakhir: {terakhir}. AC yang rutin dibersihkan lebih dingin dan hemat listrik. Mau kami jadwalkan minggu ini? 🙏';
export function pesanPengingat(d: AllData, p: Pelanggan, units: UnitJatuhTempo[]) {
  const terakhir = units.map(u => u.terakhir).filter(Boolean).sort()[0];
  return (d.settings.templatePengingat || TEMPLATE_PENGINGAT)
    .replace(/\{nama\}/g, p.nama).replace(/\{usaha\}/g, d.settings.nama || 'kami')
    .replace(/\{terakhir\}/g, terakhir ? fmtLong(terakhir) : 'belum tercatat')
    .replace(/\{unit\}/g, units.map(u => labelUnit(u)).join(', ') || 'AC');
}

function PerluDihubungi() {
  const { d, open, run } = useDash();
  const rows = d.pelanggan
    .map(p => ({ p, units: perluDihubungi(p, d.orders, d.today) }))
    .filter((x): x is { p: Pelanggan; units: UnitJatuhTempo[] } => !!x.units)
    .map(x => ({ ...x, paling: x.units.map(u => u.berikut || '0000').sort()[0] }))
    .sort((a, b) => a.paling.localeCompare(b.paling));
  if (!rows.length) return <div className="panel empty"><b>Tidak ada yang perlu dihubungi</b>Konsumen muncul di sini 7 hari sebelum jadwal cuci AC unitnya (servis terakhir + interval).</div>;
  return (
    <div className="tablebox">
      <table>
        <thead><tr><th>Konsumen</th><th>Unit yang waktunya dicuci</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ p, units }) => (
            <tr key={p.id}>
              <td><b>{p.nama}</b><div className="sm">{p.hp || 'tanpa no. WA'}{p.pengingat ? ` · terakhir dihubungi ${fmtD(p.pengingat.tanggal)} (${p.pengingat.hasil})` : ''}</div></td>
              <td>
                {units.map(u => (
                  <div key={u.id} className="sm" style={{ marginBottom: 2 }}>
                    <b style={{ color: 'var(--ink)' }}>{labelUnit(u)}</b>{u.kode ? <span className="mono"> · {u.kode}</span> : null}<br />
                    {u.terakhir ? <>terakhir {fmtD(u.terakhir)}{u.perkiraan ? ' (perkiraan)' : ''} · </> : 'belum ada data servis · '}
                    {u.berikut && <span style={{ color: u.berikut < d.today ? 'var(--bad)' : 'var(--warn)', fontWeight: 600 }}>{u.berikut < d.today ? 'lewat ' : 'jadwal '}{fmtD(u.berikut)}</span>}
                  </div>
                ))}
              </td>
              <td>
                <span className="actions">
                  {waNumber(p.hp) && <Button size="sm" nativeButton={false} render={<a href={`https://wa.me/${waNumber(p.hp)}?text=${encodeURIComponent(pesanPengingat(d, p, units))}`} target="_blank" rel="noopener noreferrer" />}>Kirim WA</Button>}
                  <Button size="sm" variant="secondary" onClick={async () => { if (await run(catatPengingat(p.id, 'Mau'), `${p.nama}: mau dijadwalkan`)) open({ kind: 'order', pelangganId: p.id }); }}>✅ Mau</Button>
                  <Button size="sm" variant="outline" onClick={() => run(catatPengingat(p.id, 'Nanti'), `${p.nama}: diingatkan lagi 14 hari`)}>⏰ Nanti</Button>
                  <Button size="sm" variant="outline" onClick={() => run(catatPengingat(p.id, 'Tidak'), `${p.nama}: diingatkan siklus berikutnya`)}>❌ Tidak</Button>
                  <Button size="xs" variant="ghost" onClick={() => run(catatPengingat(p.id, 'Nomor salah'), `${p.nama}: pengingat dimatikan`)}>📵 Nomor salah</Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filter = 'Semua' | 'Perorangan' | 'Instansi' | 'Dihubungi' | 'Baru' | 'Teknisi';

export function PelangganView({ awal = 'Semua' }: { awal?: Filter }) {
  const { d, open } = useDash();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>(awal);
  const nIngat = d.pelanggan.filter(p => perluDiingatkan(d, p)).length;
  const nBaru = d.pelanggan.filter(p => p.baru).length;
  const nTek = d.pelanggan.filter(p => p.cekTeknisi).length;
  const qq = q.trim().toLowerCase();
  const rows = d.pelanggan
    .filter(p => f === 'Semua' || (f === 'Baru' ? p.baru : f === 'Teknisi' ? p.cekTeknisi : p.jenis === f))
    .filter(p => !qq || [p.nama, p.hp, p.alamat, ...(p.units || []).map(u => (u.kode || '') + ' ' + labelUnit(u)), ...(p.gedung || [])].join(' ').toLowerCase().includes(qq))
    .map(p => ({ p, ...infoServis(d, p) }))
    .sort((a, b) => +!!b.p.baru - +!!a.p.baru || +!!b.p.cekTeknisi - +!!a.p.cekTeknisi || b.piutang - a.piutang || a.p.nama.localeCompare(b.p.nama));

  return (
    <>
      <div className="section-head">
        <div><h2>Pelanggan</h2><p>Database konsumen & unit AC. Tersimpan otomatis dari order dan dari form daftar online.</p></div>
        <div className="actions">
          <Button onClick={() => open({ kind: 'pelanggan' })}>+ Konsumen</Button>
          <Button variant="outline" onClick={() => open({ kind: 'bagikanForm' })}>Bagikan form daftar</Button>
          <Button variant="outline" nativeButton={false} render={<a href="/stiker" />}>Cetak stiker QR kosong</Button>
          {(d.pendataan || []).map(x => <Button key={x.id} variant="outline" nativeButton={false} render={<a href={`/pendataan?p=${x.id}`} />}>📋 Pendataan AC · {x.nama}</Button>)}
        </div>
      </div>
      <div className="toolbar">
        <div className="seg">
          <button aria-pressed={f === 'Semua'} onClick={() => setF('Semua')}>Semua · {d.pelanggan.length}</button>
          {JENIS_PELANGGAN.map(j => <button key={j} aria-pressed={f === j} onClick={() => setF(j)}>{j}</button>)}
          <button aria-pressed={f === 'Dihubungi'} onClick={() => setF('Dihubungi')}>Perlu dihubungi{nIngat ? ` · ${nIngat}` : ''}</button>
          {nBaru > 0 && <button aria-pressed={f === 'Baru'} onClick={() => setF('Baru')}>Baru dari form · {nBaru}</button>}
          {nTek > 0 && <button aria-pressed={f === 'Teknisi'} onClick={() => setF('Teknisi')}>Baru dari teknisi · {nTek}</button>}
        </div>
        {f !== 'Dihubungi' && <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, no. HP, alamat, kode unit…" />}
      </div>
      {f === 'Dihubungi' ? <PerluDihubungi /> : rows.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Konsumen</th><th>Jenis</th><th className="r">Unit</th><th className="r">Order</th><th>Servis terakhir</th><th>Jadwal berikut</th><th className="r">Sisa tagihan</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ p, os, terakhir, berikut, piutang }) => (
                <tr key={p.id} style={p.baru ? { background: 'var(--brand-soft)' } : undefined}>
                  <td><button className="linkbtn" onClick={() => open({ kind: 'pelanggan', id: p.id })}><b>{p.nama}</b></button>{p.baru && <> <span className="pill brand">Baru dari form</span></>}{p.cekTeknisi && <> <span className="pill brand">Baru dari teknisi</span></>}{p.izinPengingat === false && <> <span className="pill">tanpa pengingat</span></>}
                    <div className="sm">{p.hp}{p.alamat ? ' · ' + p.alamat : ''}</div></td>
                  <td><span className={`pill ${p.jenis === 'Instansi' ? 'brand' : ''}`}>{p.tipeLokasi || p.jenis}{p.jenis === 'Instansi' && p.tempoHari ? ` · tempo ${p.tempoHari} hr` : ''}</span></td>
                  <td className="r num">{(p.units || []).filter(u => !u.nonaktif).length}{p.gedung?.length ? <div className="sm">{p.gedung.length} gedung</div> : null}</td>
                  <td className="r num">{os.length}</td>
                  <td className="num">{terakhir ? fmtD(terakhir) : '—'}</td>
                  <td className="num">{berikut ? <span className={`pill ${berikut <= d.today ? 'warn' : ''}`}>{fmtD(berikut)}</span> : '—'}</td>
                  <td className="r num" style={piutang ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{piutang ? rp(piutang) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="outline" onClick={() => open({ kind: 'order', pelangganId: p.id })}>+ Order</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty"><b>Belum ada konsumen</b>Tambah lewat “+ Konsumen”, bagikan form daftar online ke konsumen lama, atau otomatis saat membuat order.</div>
      )}
    </>
  );
}

export function PelangganDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run, open, go, tambahOrder } = useDash();
  const [muatLama, setMuatLama] = useState(false);
  const p = id ? d.pelanggan.find(x => x.id === id) : undefined;
  const [jenis, setJenis] = useState<Pelanggan['jenis']>(p?.jenis || 'Perorangan');
  const [units, setUnits] = useState<UnitRow[]>(() => keUnitRows(p?.units || []));
  const [gedung, setGedung] = useState<string[]>(p?.gedung || []);
  const [versi] = useState(p?.updatedAt || 0); // versi data saat jendela dibuka (cegah menimpa perubahan teknisi)
  const [awalJson] = useState(() => JSON.stringify([p?.units || [], p?.gedung || []]));
  const [mode, setMode] = useState<'tabel' | 'ubah'>(p?.units?.length ? 'tabel' : 'ubah');
  const [filterG, setFilterG] = useState('');
  const setU = (key: number, patch: Partial<UnitAC>) => setUnits(us => us.map(u => (u.key === key ? { ...u, ...patch } : u)));
  const info = p ? infoServis(d, p) : null;
  const intervalDef = p?.intervalBulan || 3;
  const owner = d.me.peran === 'owner';
  const berubah = () => JSON.stringify([units.map(({ key, ...u }) => (void key, u)), gedung]) !== awalJson;
  const nCek = (p?.units || []).filter(u => u.cek).length;
  const tampil = units.filter(u => !filterG || (filterG === '__tanpa' ? !u.gedung : u.gedung === filterG));

  return (
    <FormDialog
      title={p ? p.nama : 'Konsumen baru'}
      onClose={onClose}
      submitLabel={p?.baru || p?.cekTeknisi ? 'Simpan & tandai sudah dicek' : 'Simpan'}
      onSubmit={async form => {
        const f = formObj(form);
        const r = await savePelanggan(p?.id || null, {
          nama: f.nama, hp: f.hp, alamat: f.alamat, maps: f.maps, patokan: f.patokan, tipeLokasi: f.tipeLokasi, sumber: f.sumber,
          jenis, tempoHari: jenis === 'Instansi' ? +f.tempoHari || 0 : 0, intervalBulan: +f.intervalBulan || 3,
          izinPengingat: !!f.izinPengingat, rekening: (f.rekening || undefined) as Pelanggan['rekening'], units: units.map(({ key, ...u }) => (void key, u)), gedung, catatan: f.catatan, versi,
          stikerSeri: f.stikerSeri ?? p?.stikerSeri ?? '', stikerNama: f.stikerNama ?? p?.stikerNama ?? '', pendataan: f.stikerSeri !== undefined ? !!f.pendataan : !!p?.pendataan,
        });
        return run(Promise.resolve(r.ok ? { ok: true as const } : r), p ? 'Data konsumen diperbarui' : 'Konsumen ditambahkan');
      }}
      onDelete={p && owner ? () => run(hapusPelanggan(p.id), 'Konsumen dihapus') : undefined}
    >
      {p?.baru && <p className="banner" style={{ margin: 0 }}>Konsumen ini mendaftar lewat form online. Periksa datanya, lalu klik “Simpan & tandai sudah dicek”.</p>}
      {nCek > 0 && <p className="banner" style={{ margin: 0 }}>{nCek} unit baru dicatat / diubah teknisi di lapangan (bertanda “Baru dari teknisi”). Periksa datanya, lalu klik “Simpan & tandai sudah dicek”.</p>}
      <div className="grid2">
        <label className="lbl span2">Nama konsumen / instansi<input className="field" name="nama" required defaultValue={p?.nama || ''} autoFocus={!p} /></label>
        <label className="lbl">No. WhatsApp<input className="field" name="hp" inputMode="tel" defaultValue={p?.hp || ''} placeholder="08xxxxxxxxxx" /></label>
        <label className="lbl">Jenis lokasi
          <select className="field" name="tipeLokasi" defaultValue={p?.tipeLokasi || 'Rumah'}>{TIPE_LOKASI.map(t => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="lbl span2">Alamat<input className="field" name="alamat" defaultValue={p?.alamat || ''} /></label>
        <label className="lbl">Patokan<input className="field" name="patokan" defaultValue={p?.patokan || ''} placeholder="mis. depan masjid, pagar hijau" /></label>
        <label className="lbl">Link Google Maps<input className="field" name="maps" defaultValue={p?.maps || ''} placeholder="https://maps.app.goo.gl/…" /></label>
        <label className="lbl">Penagihan
          <select className="field" value={jenis} onChange={e => setJenis(e.target.value as Pelanggan['jenis'])}>{JENIS_PELANGGAN.map(j => <option key={j} value={j}>{j === 'Instansi' ? 'Instansi (tempo / rekap bulanan)' : 'Perorangan (bayar di tempat)'}</option>)}</select>
        </label>
        <label className="lbl">Rekening di invoice
          <select className="field" name="rekening" defaultValue={p?.rekening || ''}>
            <option value="">Otomatis ({jenis === 'Instansi' ? 'rekening CV' : 'rekening pribadi'})</option>
            <option value="cv">Rekening atas nama CV</option>
            <option value="pribadi">Rekening pribadi</option>
          </select>
        </label>
        <label className="lbl">Sumber konsumen<input className="field" name="sumber" list="sumberOpsi" defaultValue={p?.sumber || ''} placeholder="mis. Instagram, rekomendasi" /></label>
        <datalist id="sumberOpsi">{['Instagram', 'Facebook', 'TikTok', 'Google Maps', 'Rekomendasi teman', 'Pelanggan lama', 'Form online', 'Order'].map(s => <option key={s} value={s} />)}</datalist>
        <label className="lbl">Interval cuci bawaan (bulan)<input className="field" type="number" name="intervalBulan" min={1} max={24} defaultValue={intervalDef} /></label>
        <label className="lbl span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" name="izinPengingat" defaultChecked={p?.izinPengingat !== false} /> Kirimi pengingat cuci AC lewat WhatsApp
        </label>
      </div>

      {(jenis === 'Instansi' || gedung.length > 0) && <GedungEditor gedung={gedung} setGedung={setGedung} units={units} setUnits={setUnits} />}

      {(jenis === 'Instansi' || p?.stikerSeri) && (
        <fieldset className="box">
          <legend>Stiker QR khusus instansi</legend>
          <div className="grid2">
            <label className="lbl">Kode seri stiker <span className="sm">(2–6 huruf, mis. RSUD)</span>
              <input className="field mono" name="stikerSeri" defaultValue={p?.stikerSeri || ''} maxLength={6} style={{ textTransform: 'uppercase' }} placeholder="kosong = stiker umum GT" />
            </label>
            <label className="lbl">Nama yang dicetak di stiker<input className="field" name="stikerNama" defaultValue={p?.stikerNama || ''} maxLength={80} placeholder="mis. RSUD Ade Muhammad Djoen Sintang" /></label>
            <label className="lbl span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" name="pendataan" defaultChecked={!!p?.pendataan} /> Mode pendataan aktif (pemilik, admin &amp; teknisi bisa mendata AC lewat stiker khusus tanpa order)
            </label>
          </div>
          {p?.stikerSeri ? (
            <div className="actions">
              <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={`/stiker?k=${p.id}`} />}>Cetak stiker kosong {p.stikerSeri}</Button>
              {p.pendataan && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={`/pendataan?p=${p.id}`} />}>Buka mode pendataan</Button>}
            </div>
          ) : <p className="hint" style={{ margin: 0 }}>Isi kode seri lalu simpan. Setelah itu tombol cetak stiker khusus & mode pendataan muncul di sini.</p>}
        </fieldset>
      )}

      <fieldset className="box">
        <legend>Unit AC · {units.filter(u => !u.nonaktif).length}{units.some(u => u.nonaktif) ? ` (+${units.filter(u => u.nonaktif).length} tidak aktif)` : ''}</legend>
        {p && p.units?.length ? (
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={mode === 'tabel'} onClick={() => setMode('tabel')}>Daftar per gedung</button>
            <button type="button" aria-pressed={mode === 'ubah'} onClick={() => setMode('ubah')}>Ubah data unit</button>
          </div>
        ) : null}
        {p && mode === 'tabel' && p.units?.length ? (
          <>
            <UnitPerGedung d={d} p={p} os={info?.os || []} onOrder={ids => open({ kind: 'order', pelangganId: p.id, unitIds: ids })} />
            {berubah() && <p className="hint" style={{ color: 'var(--warn)', margin: 0 }}>Ada perubahan yang belum disimpan — daftar ini menampilkan data tersimpan.</p>}
          </>
        ) : (
          <>
            {gedung.length > 0 && (
              <label className="lbl" style={{ maxWidth: 320 }}>Tampilkan
                <select className="field" value={filterG} onChange={e => setFilterG(e.target.value)}>
                  <option value="">Semua gedung ({units.length})</option>
                  {gedung.map(g => <option key={g} value={g}>{g} ({units.filter(u => u.gedung === g).length})</option>)}
                  <option value="__tanpa">Tanpa gedung ({units.filter(u => !u.gedung).length})</option>
                </select>
              </label>
            )}
            {tampil.map(u => {
              const j = p ? jadwalUnit(u, info?.os || [], intervalDef) : null;
              return (
                <UnitKartu key={u.key} u={u} setU={patch => setU(u.key, patch)} gedung={gedung} interval={intervalDef} today={d.today} owner={owner} namaSaya={d.me.nama}
                  info={j?.berikut ? `jadwal berikut ${fmtD(j.berikut)}` : ''}
                  onHapus={() => setUnits(us => us.filter(x => x.key !== u.key))}
                  onStiker={p ? () => (berubah() ? toast.error('Simpan dulu perubahan di jendela ini, lalu buka lagi untuk mengatur stiker & foto.') : open({ kind: 'stikerUnit', pelangganId: p.id, unitId: u.id })) : undefined} />
              );
            })}
            <DatalistUnit />
            <div><Button type="button" size="sm" variant="outline" onClick={() => setUnits(us => [...us, unitRowBaru(intervalDef, filterG && filterG !== '__tanpa' ? filterG : '')])}>+ Tambah unit AC</Button></div>
            <p className="hint" style={{ margin: 0 }}>Servis terakhir otomatis diperbarui setiap order untuk unit ini berstatus Selesai. AC yang dibongkar: klik “Tidak aktif” (data & riwayat tetap tersimpan, pengingat berhenti).{!owner && ' Menghapus unit hanya bisa oleh pemilik.'}</p>
          </>
        )}
      </fieldset>

      <label className="lbl">Catatan<textarea className="field" name="catatan" defaultValue={p?.catatan || ''} placeholder="mis. hubungi bagian umum, pak Andi" /></label>

      {p && info && (
        <fieldset className="box">
          <legend>Riwayat order · {info.os.length}{info.piutang ? ` · sisa tagihan ${rp(info.piutang)}` : ''}</legend>
          <div className="actions">
            <Button type="button" size="sm" onClick={() => open({ kind: 'order', pelangganId: p.id })}>+ Order baru untuk konsumen ini</Button>
            {(p.maps || p.alamat) && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={mapsUrl(p.alamat, p.maps)} target="_blank" rel="noopener noreferrer" />}>Buka Maps</Button>}
            {p.units?.length ? <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={`/stiker?p=${p.id}`} />}>Cetak stiker unit</Button> : null}
            <Button type="button" size="sm" variant="ghost" disabled={muatLama} onClick={async () => {
              setMuatLama(true);
              const r = await orderPelangganLengkap(p.id);
              setMuatLama(false);
              if (!r.ok) return toast.error(r.error);
              tambahOrder(r.data);
              toast.success(`${r.data.length} order pelanggan ini dimuat`);
            }}>{muatLama ? 'Memuat…' : 'Muat semua order lama'}</Button>
          </div>
          {info.os.length ? (
            <ul className="list">
              {info.os.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 200).map(o => (
                <li key={o.id}>
                  <span className="time">{fmtD(o.tanggal)}</span>
                  <div className="main">{ringkasItems(o.items)}<div className="meta mono">{o.invoice} · {rp(o.total)}</div></div>
                  <span className="actions"><span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span><BayarPill o={o} today={d.today} />
                    <button type="button" className="linkbtn" onClick={() => go('invoice', { invSel: o.id })}>Invoice</button></span>
                </li>
              ))}
            </ul>
          ) : <div className="empty">Belum ada order.</div>}
        </fieldset>
      )}
    </FormDialog>
  );
}
