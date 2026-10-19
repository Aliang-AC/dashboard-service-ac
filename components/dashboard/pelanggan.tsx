'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { hapusPelanggan, savePelanggan } from '@/app/actions';
import { STATUS_CLS } from '@/lib/derive';
import { fmtD, rp } from '@/lib/format';
import { ringkasItems, sisa } from '@/lib/order';
import { JENIS_PELANGGAN, type AllData, type Pelanggan, type UnitAC } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { BayarPill, mapsUrl } from './order';

/* order milik pelanggan: lewat pelangganId, atau (order lama) nama yang sama */
export const orderPelanggan = (d: AllData, p: Pelanggan) =>
  d.orders.filter(o => o.pelangganId === p.id || (!o.pelangganId && o.pelanggan.trim().toLowerCase() === p.nama.trim().toLowerCase()));

const tambahBulan = (tgl: string, n: number) => {
  const [y, m, dd] = tgl.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, dd));
  return t.toISOString().slice(0, 10);
};
export function infoServis(d: AllData, p: Pelanggan) {
  const os = orderPelanggan(d, p);
  const terakhir = os.filter(o => o.status === 'Selesai').map(o => o.tanggal).sort().pop() || '';
  const berikut = terakhir ? tambahBulan(terakhir, p.intervalBulan || 3) : '';
  const piutang = os.filter(o => o.status !== 'Batal').reduce((a, o) => a + sisa(o), 0);
  return { os, terakhir, berikut, piutang };
}

export function PelangganView() {
  const { d, open } = useDash();
  const [q, setQ] = useState('');
  const [jenis, setJenis] = useState<'Semua' | Pelanggan['jenis']>('Semua');
  const qq = q.trim().toLowerCase();
  const rows = d.pelanggan
    .filter(p => jenis === 'Semua' || p.jenis === jenis)
    .filter(p => !qq || [p.nama, p.hp, p.alamat].join(' ').toLowerCase().includes(qq))
    .map(p => ({ p, ...infoServis(d, p) }))
    .sort((a, b) => b.piutang - a.piutang || a.p.nama.localeCompare(b.p.nama));

  return (
    <>
      <div className="section-head">
        <div><h2>Pelanggan</h2><p>Tersimpan otomatis dari order. Unit AC yang diketik di order ikut tercatat di sini.</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'pelanggan' })}>+ Pelanggan</Button></div>
      </div>
      <div className="toolbar">
        <div className="seg">
          {(['Semua', ...JENIS_PELANGGAN] as const).map(j => <button key={j} aria-pressed={jenis === j} onClick={() => setJenis(j)}>{j}</button>)}
        </div>
        <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, no. HP, alamat…" />
      </div>
      {rows.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Pelanggan</th><th>Jenis</th><th className="r">Order</th><th>Servis terakhir</th><th>Servis berikutnya</th><th className="r">Sisa tagihan</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ p, os, terakhir, berikut, piutang }) => (
                <tr key={p.id}>
                  <td><button className="linkbtn" onClick={() => open({ kind: 'pelanggan', id: p.id })}><b>{p.nama}</b></button><div className="sm">{p.hp}{p.alamat ? ' · ' + p.alamat : ''}</div></td>
                  <td><span className={`pill ${p.jenis === 'Instansi' ? 'brand' : ''}`}>{p.jenis}{p.jenis === 'Instansi' && p.tempoHari ? ` · ${p.tempoHari} hr` : ''}</span></td>
                  <td className="r num">{os.length}</td>
                  <td className="num">{terakhir ? fmtD(terakhir) : '—'}</td>
                  <td className="num">{berikut ? <span className={`pill ${berikut <= d.today ? 'warn' : ''}`}>{berikut <= d.today ? 'Waktunya · ' : ''}{fmtD(berikut)}</span> : '—'}</td>
                  <td className="r num" style={piutang ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{piutang ? rp(piutang) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="outline" onClick={() => open({ kind: 'order', pelangganId: p.id })}>+ Order</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty"><b>Belum ada pelanggan</b>Pelanggan otomatis tersimpan saat Anda membuat order, atau tambahkan manual lewat tombol “+ Pelanggan”.</div>
      )}
    </>
  );
}

let unitKey = 0;
export function PelangganDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run, open, go } = useDash();
  const p = id ? d.pelanggan.find(x => x.id === id) : undefined;
  const [jenis, setJenis] = useState<Pelanggan['jenis']>(p?.jenis || 'Perorangan');
  const [units, setUnits] = useState<(UnitAC & { key: number })[]>((p?.units || []).map(u => ({ ...u, key: ++unitKey })));
  const info = p ? infoServis(d, p) : null;

  return (
    <FormDialog
      title={p ? p.nama : 'Pelanggan baru'}
      onClose={onClose}
      onSubmit={async form => {
        const f = formObj(form);
        const r = await savePelanggan(p?.id || null, {
          nama: f.nama, hp: f.hp, alamat: f.alamat, maps: f.maps, jenis, tempoHari: jenis === 'Instansi' ? +f.tempoHari || 0 : 0,
          intervalBulan: +f.intervalBulan || 3, units: units.map(({ id, label }) => ({ id, label })), catatan: f.catatan,
        });
        return run(Promise.resolve(r.ok ? { ok: true as const } : r), p ? 'Data pelanggan diperbarui' : 'Pelanggan ditambahkan');
      }}
      onDelete={p && d.me.peran === 'owner' ? () => run(hapusPelanggan(p.id), 'Pelanggan dihapus') : undefined}
    >
      <div className="grid2">
        <label className="lbl span2">Nama pelanggan / instansi<input className="field" name="nama" required defaultValue={p?.nama || ''} autoFocus={!p} /></label>
        <label className="lbl">No. HP / WA<input className="field" name="hp" inputMode="tel" defaultValue={p?.hp || ''} /></label>
        <label className="lbl">Jenis
          <select className="field" value={jenis} onChange={e => setJenis(e.target.value as Pelanggan['jenis'])}>{JENIS_PELANGGAN.map(j => <option key={j}>{j}</option>)}</select>
        </label>
        <label className="lbl span2">Alamat<input className="field" name="alamat" defaultValue={p?.alamat || ''} /></label>
        <label className="lbl span2">Link Google Maps (opsional)<input className="field" name="maps" defaultValue={p?.maps || ''} placeholder="https://maps.app.goo.gl/…" /></label>
        {jenis === 'Instansi' && <label className="lbl">Tempo bayar (hari)<input className="field" type="number" name="tempoHari" min={0} max={365} defaultValue={p?.tempoHari ?? 30} /></label>}
        <label className="lbl">Pengingat servis tiap (bulan)<input className="field" type="number" name="intervalBulan" min={1} max={24} defaultValue={p?.intervalBulan ?? 3} /></label>
      </div>

      <fieldset className="box">
        <legend>Unit AC di lokasi pelanggan</legend>
        {units.map(u => (
          <div key={u.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 34px', gap: 6 }}>
            <input className="field" value={u.label} placeholder="mis. Daikin 1 PK – Kamar depan"
              onChange={e => setUnits(us => us.map(x => (x.key === u.key ? { ...x, label: e.target.value } : x)))} />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus unit" onClick={() => setUnits(us => us.filter(x => x.key !== u.key))}>×</Button>
          </div>
        ))}
        <div><Button type="button" size="sm" variant="outline" onClick={() => setUnits(us => [...us, { key: ++unitKey, id: '', label: '' }])}>+ Tambah unit</Button></div>
      </fieldset>

      <label className="lbl">Catatan<textarea className="field" name="catatan" defaultValue={p?.catatan || ''} placeholder="mis. hubungi bagian umum, pak Andi" /></label>

      {p && info && (
        <fieldset className="box">
          <legend>Riwayat order · {info.os.length}{info.piutang ? ` · sisa tagihan ${rp(info.piutang)}` : ''}</legend>
          <div className="actions">
            <Button type="button" size="sm" onClick={() => open({ kind: 'order', pelangganId: p.id })}>+ Order baru untuk pelanggan ini</Button>
            {(p.maps || p.alamat) && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={mapsUrl(p.alamat, p.maps)} target="_blank" rel="noopener noreferrer" />}>Buka Maps</Button>}
          </div>
          {info.os.length ? (
            <ul className="list">
              {info.os.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 30).map(o => (
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
