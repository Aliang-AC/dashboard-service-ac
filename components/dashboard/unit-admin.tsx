'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cekStiker, pasangStiker, type InfoStiker } from '@/app/actions';
import { MEREK_LENGKAP } from '@/lib/brand';
import { addDays, fmtD } from '@/lib/format';
import { jadwalUnit } from '@/lib/servis';
import { FREON, TIPE_AC, type AllData, type Order, type Pelanggan, type UnitAC } from '@/lib/types';
import { lokasiUnit, specUnit } from '@/lib/unit';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { cetakHtml, esc } from './invoice';
import { FotoNameplate, MERK_AC, ScanStiker, StatusStikerBox, stikerBisaDipakai } from './unit-lapangan';

export type UnitRow = UnitAC & { key: number };
let unitKey = 0;
export const keUnitRows = (units: UnitAC[]) => units.map(u => ({ ...u, key: ++unitKey }));
export const unitRowBaru = (interval: number, gedung = ''): UnitRow => ({ key: ++unitKey, id: '', label: '', gedung, tipe: 'Split', intervalBulan: interval });

const TANPA = '__tanpa';
type StatusUnit = { teks: string; cls: string };
export function statusUnit(u: UnitAC, os: Pick<Order, 'tanggal' | 'status' | 'items'>[], interval: number, today: string): StatusUnit & { terakhir: string; berikut: string } {
  const j = jadwalUnit(u, os, interval);
  const s = u.nonaktif ? { teks: 'Tidak aktif', cls: '' }
    : !j.berikut ? { teks: 'Belum ada data servis', cls: 'warn' }
    : j.berikut < today ? { teks: 'Lewat jadwal', cls: 'bad' }
    : j.berikut <= addDays(today, 7) ? { teks: 'Waktunya servis', cls: 'warn' }
    : { teks: 'Aman', cls: 'good' };
  return { ...s, terakhir: j.terakhir, berikut: j.berikut };
}

/* Tampilan unit AC per gedung: tombol gedung, ringkasan status, tabel detail, order/unduh/cetak per gedung. */
export function UnitPerGedung({ d, p, os, onOrder }: { d: AllData; p: Pelanggan; os: Order[]; onOrder: (unitIds: string[]) => void }) {
  const units = p.units || [];
  const daftar = p.gedung || [];
  const adaGedung = daftar.length > 0 || units.some(u => u.gedung);
  const [g, setG] = useState('');
  const pilihan = units.filter(u => !g || (g === TANPA ? !u.gedung : u.gedung === g));
  const rows = pilihan
    .map(u => ({ u, ...statusUnit(u, os, p.intervalBulan, d.today) }))
    .sort((a, b) => +!!a.u.nonaktif - +!!b.u.nonaktif || (a.u.gedung || '').localeCompare(b.u.gedung || '') || (a.u.noAc || '').localeCompare(b.u.noAc || '', 'id', { numeric: true }) || a.u.label.localeCompare(b.u.label));
  const hitung = (cls: string) => rows.filter(r => r.cls === cls && !r.u.nonaktif).length;
  const judulGedung = g === TANPA ? 'Tanpa gedung' : g || 'Semua gedung';

  const kolom = ['Gedung', 'Ruangan', 'No. AC', 'Merk', 'PK', 'Tipe', 'Freon', 'Servis terakhir', 'Jadwal berikutnya', 'Status', 'Kode stiker', 'Catatan'];
  const nilai = (r: (typeof rows)[number]) => [r.u.gedung || '', r.u.label, r.u.noAc || '', r.u.merk || '', r.u.pk || '', r.u.tipe || '', r.u.freon || '', r.terakhir ? fmtD(r.terakhir) : '', r.berikut ? fmtD(r.berikut) : '', r.teks, r.u.kode || '', r.u.catatan || ''];
  const unduh = () => {
    const sel = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = '﻿' + [kolom, ...rows.map(nilai)].map(r => r.map(sel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Unit AC ${p.nama} - ${judulGedung}.csv`.replace(/[\\/:*?"<>|]/g, '-');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const cetak = () => cetakHtml(`Daftar unit AC ${p.nama}`,
    `<div class="ph"><div><h4>${esc(MEREK_LENGKAP)}</h4><div class="pmuted">Daftar unit AC · ${esc(p.nama)}</div></div><div class="pmuted" style="text-align:right">${esc(judulGedung)}<br>${fmtD(d.today)}</div></div>
     <table style="font-size:12px"><thead><tr>${kolom.slice(0, 11).map(k => `<th>${k}</th>`).join('')}</tr></thead>
     <tbody>${rows.map(r => `<tr>${nilai(r).slice(0, 11).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
     <p class="pmuted">${rows.length} unit · ${hitung('good')} aman · ${hitung('warn')} waktunya servis · ${hitung('bad')} lewat jadwal</p>`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {adaGedung && (
        <div className="actions">
          <button type="button" className={`pill ${!g ? 'brand' : ''}`} style={{ cursor: 'pointer', padding: '4px 10px' }} onClick={() => setG('')}>Semua · {units.length}</button>
          {daftar.map(x => <button key={x} type="button" className={`pill ${g === x ? 'brand' : ''}`} style={{ cursor: 'pointer', padding: '4px 10px' }} onClick={() => setG(x)}>{x} · {units.filter(u => u.gedung === x).length}</button>)}
          {units.some(u => !u.gedung) && <button type="button" className={`pill ${g === TANPA ? 'brand' : ''}`} style={{ cursor: 'pointer', padding: '4px 10px' }} onClick={() => setG(TANPA)}>Tanpa gedung · {units.filter(u => !u.gedung).length}</button>}
        </div>
      )}
      <div className="actions sm">
        <span><b>{rows.filter(r => !r.u.nonaktif).length}</b> unit</span>
        {hitung('warn') > 0 && <span style={{ color: 'var(--warn)' }}><b>{hitung('warn')}</b> waktunya servis</span>}
        {hitung('bad') > 0 && <span style={{ color: 'var(--bad)' }}><b>{hitung('bad')}</b> lewat jadwal</span>}
        <span style={{ color: 'var(--good)' }}><b>{hitung('good')}</b> aman</span>
      </div>
      <div className="actions">
        <Button type="button" size="sm" disabled={!rows.some(r => !r.u.nonaktif)} onClick={() => onOrder(rows.filter(r => !r.u.nonaktif).map(r => r.u.id))}>+ Order untuk {g ? judulGedung : 'semua unit'}</Button>
        <Button type="button" size="sm" variant="outline" disabled={!rows.length} onClick={unduh}>⬇ Unduh (Excel)</Button>
        <Button type="button" size="sm" variant="outline" disabled={!rows.length} onClick={cetak}>🖨 Cetak daftar</Button>
      </div>
      <div className="tablebox" style={{ maxHeight: 360, overflow: 'auto' }}>
        <table>
          <thead><tr>{adaGedung && !g && <th>Gedung</th>}<th>No.</th><th>Ruangan</th><th>Merk / PK</th><th>Freon</th><th>Servis terakhir</th><th>Berikutnya</th><th>Status</th><th>Stiker</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.u.id} style={r.u.nonaktif ? { opacity: .55 } : undefined}>
                {adaGedung && !g && <td className="sm">{r.u.gedung || '—'}</td>}
                <td className="num"><b>{r.u.noAc || '—'}</b></td>
                <td>{r.u.label || '—'}{r.u.cek && <> <span className="pill brand">Baru dari teknisi</span></>}</td>
                <td className="sm">{[r.u.merk, r.u.pk && (/pk/i.test(r.u.pk) ? r.u.pk : r.u.pk + ' PK'), r.u.tipe !== 'Split' ? r.u.tipe : ''].filter(Boolean).join(' ') || '—'}</td>
                <td className="sm">{r.u.freon || '—'}</td>
                <td className="num">{r.terakhir ? fmtD(r.terakhir) : '—'}</td>
                <td className="num">{r.berikut ? fmtD(r.berikut) : '—'}</td>
                <td><span className={`pill ${r.cls}`}>{r.teks}</span></td>
                <td className="mono sm">{r.u.kode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Kelola daftar gedung: ganti nama, gabungkan (kalau dobel), hapus yang tidak dipakai, tambah. */
export function GedungEditor({ gedung, setGedung, units, setUnits }: { gedung: string[]; setGedung: (g: string[]) => void; units: UnitRow[]; setUnits: (f: (u: UnitRow[]) => UnitRow[]) => void }) {
  const [baru, setBaru] = useState('');
  const pindah = (dari: string, ke: string) => {
    setUnits(us => us.map(u => (u.gedung === dari ? { ...u, gedung: ke } : u)));
    setGedung(gedung.filter(x => x !== dari).map(x => x).concat(ke && !gedung.includes(ke) ? [ke] : []).filter((x, i, a) => a.indexOf(x) === i));
  };
  const ganti = (lama: string, nama: string) => {
    const n = nama.trim();
    if (!n || n === lama) return;
    if (gedung.some(x => x !== lama && x.toLowerCase() === n.toLowerCase())) return toast.error(`"${n}" sudah ada. Pakai "Gabungkan ke" untuk menyatukan.`);
    setUnits(us => us.map(u => (u.gedung === lama ? { ...u, gedung: n } : u)));
    setGedung(gedung.map(x => (x === lama ? n : x)));
  };
  return (
    <fieldset className="box">
      <legend>Gedung / area · {gedung.length}</legend>
      <p className="hint" style={{ margin: 0 }}>Untuk instansi / kantor. Teknisi memilih gedung dari daftar ini saat mencatat unit, supaya tidak dobel.</p>
      {gedung.map(x => {
        const n = units.filter(u => u.gedung === x).length;
        return (
          <div key={x} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 6, alignItems: 'center' }}>
            <input className="field" defaultValue={x} onBlur={e => ganti(x, e.target.value)} aria-label="Nama gedung" />
            <select className="field" value="" onChange={e => e.target.value && pindah(x, e.target.value === TANPA ? '' : e.target.value)} style={{ width: 'auto' }} aria-label="Gabungkan ke">
              <option value="">{n} unit · gabungkan ke…</option>
              {gedung.filter(y => y !== x).map(y => <option key={y} value={y}>{y}</option>)}
              <option value={TANPA}>(hapus gedung, unit jadi tanpa gedung)</option>
            </select>
            {!n ? <Button type="button" size="xs" variant="ghost" onClick={() => setGedung(gedung.filter(y => y !== x))}>Hapus</Button> : <span />}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="field" value={baru} onChange={e => setBaru(e.target.value)} placeholder="Tambah gedung, mis. Gedung IGD" style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); } }} />
        <Button type="button" size="sm" variant="outline" disabled={!baru.trim()} onClick={() => {
          const n = baru.trim();
          if (gedung.some(x => x.toLowerCase() === n.toLowerCase())) return toast.error('Gedung itu sudah ada.');
          setGedung([...gedung, n]); setBaru('');
        }}>+ Tambah</Button>
      </div>
    </fieldset>
  );
}

/* Kartu ubah unit di data konsumen (admin/pemilik). */
export function UnitKartu({ u, setU, gedung, interval, info, owner, onHapus, onStiker, namaSaya, today }: {
  u: UnitRow; setU: (patch: Partial<UnitAC>) => void; gedung: string[]; interval: number; info?: string;
  owner: boolean; onHapus: () => void; onStiker?: () => void; namaSaya: string; today: string;
}) {
  const gantiUnit = () => {
    if (!u.merk && !u.pk) return toast.error('Data AC lama kosong, tidak ada yang perlu dipindah ke riwayat.');
    setU({ riwayat: [...(u.riwayat || []), { merk: u.merk || '', pk: u.pk || '', tipe: u.tipe || '', freon: u.freon || '', tahun: u.tahun || '', sampai: today, ket: 'Diganti unit baru', oleh: namaSaya }], merk: '', pk: '', freon: '', tahun: '', tipe: 'Split', inverter: false, garansi: undefined });
    toast.info('Data AC lama dipindah ke riwayat. Isi data AC baru, lalu Simpan.');
  };
  return (
    <div className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, opacity: u.nonaktif ? .7 : 1, borderColor: u.cek ? 'var(--brand)' : undefined }}>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <span className="sm">
          {u.kode ? <b className="mono">{u.kode}</b> : <span style={{ color: 'var(--warn)' }}>belum ada stiker</span>}
          {info ? ` · ${info}` : ''}
          {u.cek && <> · <span className="pill brand">Baru dari teknisi{u.dicatat ? ` · ${u.dicatat.oleh}` : ''}</span></>}
          {u.nonaktif && <> · <span className="pill">Tidak aktif</span></>}
        </span>
        <span className="actions">
          {u.id && onStiker && <Button type="button" size="xs" variant="outline" onClick={onStiker}>Stiker & foto</Button>}
          {!u.nonaktif && u.id && <Button type="button" size="xs" variant="ghost" onClick={gantiUnit}>Ganti unit</Button>}
          <Button type="button" size="xs" variant="ghost" onClick={() => setU({ nonaktif: !u.nonaktif })}>{u.nonaktif ? 'Aktifkan lagi' : 'Tidak aktif'}</Button>
          {(owner || !u.id) && <Button type="button" size="xs" variant="ghost" aria-label="Hapus unit" onClick={onHapus}>Hapus</Button>}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
        {(gedung.length > 0 || u.gedung) && (
          <select className="field" value={u.gedung || ''} onChange={e => setU({ gedung: e.target.value })} aria-label="Gedung">
            <option value="">— Tanpa gedung —</option>
            {[...new Set([...gedung, ...(u.gedung ? [u.gedung] : [])])].map(g => <option key={g}>{g}</option>)}
          </select>
        )}
        <input className="field" placeholder="Ruangan (mis. Kamar depan)" value={u.label} onChange={e => setU({ label: e.target.value })} />
        <input className="field" placeholder="No. AC / aset" value={u.noAc || ''} onChange={e => setU({ noAc: e.target.value })} />
        <input className="field" placeholder="Merk" value={u.merk || ''} onChange={e => setU({ merk: e.target.value })} list="merkOpsi" />
        <input className="field" placeholder="PK (mis. 1)" value={u.pk || ''} onChange={e => setU({ pk: e.target.value })} />
        <select className="field" value={u.tipe || 'Split'} onChange={e => setU({ tipe: e.target.value })} aria-label="Tipe AC">{TIPE_AC.map(t => <option key={t}>{t}</option>)}</select>
        <select className="field" value={u.inverter ? 'Inverter' : 'Standard'} onChange={e => setU({ inverter: e.target.value === 'Inverter' })} aria-label="Standard atau inverter"><option>Standard</option><option>Inverter</option></select>
        <input className="field" placeholder="Freon (R32…)" value={u.freon || ''} onChange={e => setU({ freon: e.target.value })} list="freonOpsi" />
        <input className="field" placeholder="Tahun pasang" inputMode="numeric" value={u.tahun || ''} onChange={e => setU({ tahun: e.target.value })} />
      </div>
      <div className="grid2">
        <label className="lbl">Servis terakhir {u.perkiraan ? '(perkiraan)' : ''}<input className="field" type="date" value={u.servisTerakhir || ''} max={today} onChange={e => setU({ servisTerakhir: e.target.value, perkiraan: false })} /></label>
        <label className="lbl">Interval cuci (bulan)<input className="field" type="number" min={1} max={24} value={u.intervalBulan || interval} onChange={e => setU({ intervalBulan: +e.target.value })} /></label>
      </div>
      <input className="field" placeholder="Catatan unit (mis. indoor Daikin, outdoor Panasonic)" value={u.catatan || ''} onChange={e => setU({ catatan: e.target.value })} />
      <div className="grid2">
        <label className="lbl">Garansi s/d <span className="sm">(kosong = tidak ada)</span><input className="field" type="date" value={u.garansi?.sampai || ''} onChange={e => setU({ garansi: e.target.value ? { sampai: e.target.value, ket: u.garansi?.ket || '' } : undefined })} /></label>
        <label className="lbl">Keterangan garansi<input className="field" value={u.garansi?.ket || ''} disabled={!u.garansi?.sampai} placeholder="mis. 5 th sparepart + 10 th kompresor" onChange={e => setU({ garansi: { sampai: u.garansi?.sampai || '', ket: e.target.value } })} /></label>
      </div>
      {(u.fotoIndoor || u.fotoOutdoor) && (
        <div className="actions sm">Foto name plate:
          {u.fotoIndoor && <a className="linkbtn" href={`/api/foto/${u.fotoIndoor}`} target="_blank" rel="noopener noreferrer">indoor</a>}
          {u.fotoOutdoor && <a className="linkbtn" href={`/api/foto/${u.fotoOutdoor}`} target="_blank" rel="noopener noreferrer">outdoor</a>}
        </div>
      )}
      {!!u.riwayat?.length && (
        <div className="sm">Riwayat AC di titik ini: {u.riwayat.map((r, i) => <span key={i}>{i ? '; ' : ''}{specUnit(r) || 'AC lama'} (sampai {fmtD(r.sampai)}{r.oleh ? ', ' + r.oleh : ''})</span>)}</div>
      )}
    </div>
  );
}
export function DatalistUnit() {
  return (
    <>
      <datalist id="merkOpsi">{MERK_AC.map(m => <option key={m} value={m} />)}</datalist>
      <datalist id="freonOpsi">{FREON.map(m => <option key={m} value={m} />)}</datalist>
    </>
  );
}

/* Admin/pemilik: pasang / ganti stiker dan foto name plate satu unit, dari data konsumen. Kembali ke data konsumen saat ditutup. */
/* onClose tidak dipakai: menutup jendela ini kembali ke data konsumen */
export function StikerUnitDialog({ pelangganId, unitId }: { pelangganId: string; unitId: string; onClose: () => void }) {
  const { d, run, open } = useDash();
  const p = d.pelanggan.find(x => x.id === pelangganId);
  const u = p?.units?.find(x => x.id === unitId);
  const [scan, setScan] = useState(false);
  const [info, setInfo] = useState<InfoStiker | null>(null);
  const kembali = () => open({ kind: 'pelanggan', id: pelangganId });
  if (!p || !u) return null;
  const bisa = stikerBisaDipakai(info, p.id, u.id);
  return (
    <FormDialog wide={false} title={`Stiker & foto · ${lokasiUnit(u) || 'unit'}`} submitLabel="Selesai" onClose={kembali} onSubmit={async () => { kembali(); return false; }}>
      <p className="hint" style={{ margin: 0 }}>{p.nama} · {specUnit(u) || 'data AC belum lengkap'}</p>
      <fieldset className="box">
        <legend>Stiker QR</legend>
        <p style={{ margin: 0 }}>{u.kode ? <>Terpasang: <b className="mono">{u.kode}</b></> : 'Belum ada stiker.'}</p>
        {info && <StatusStikerBox info={info} unitId={u.id} pelangganId={p.id} />}
        {scan ? <ScanStiker onKode={async k => { setScan(false); const r = await cekStiker(k); if (r.ok) setInfo(r.data); else toast.error(r.error); }} onBatal={() => setScan(false)} /> : (
          <div className="actions">
            <Button type="button" size="sm" variant="outline" onClick={() => { setInfo(null); setScan(true); }}>📷 {u.kode ? 'Ganti stiker (rusak / hilang)' : 'Pasang stiker'}</Button>
            {bisa && info?.kode !== u.kode && <Button type="button" size="sm" onClick={() => run(pasangStiker({ pelangganId: p.id, unitId: u.id, kode: info!.kode }), `Stiker ${info!.kode} terpasang`).then(ok => ok && setInfo(null))}>Pasang {info!.kode}</Button>}
          </div>
        )}
        {u.kode && <p className="hint" style={{ margin: 0 }}>Saat diganti, stiker lama otomatis ditandai “sudah diganti” dan tidak berlaku lagi.</p>}
      </fieldset>
      <FotoNameplate u={u} pelangganId={p.id} />
    </FormDialog>
  );
}
