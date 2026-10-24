'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ajukanIzin, batalIzin, putuskanIzin } from '@/app/actions';
import { fmtD } from '@/lib/format';
import { JENIS_IZIN, type AllData, type Izin } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

/* jumlah hari tidak masuk (Sakit / Izin / Alpa) seorang karyawan dalam satu bulan; lebih dari 2 → ditandai merah */
export function hariOff(d: AllData, kid: string, bulan: string) {
  return d.absensi.filter(a => a.id.startsWith(bulan)).filter(a => ['Sakit', 'Izin', 'Alpa'].includes(a.records?.[kid]?.status || '')).length;
}
export const BATAS_OFF = 2;

const tanggalIzin = (i: Pick<Izin, 'dari' | 'sampai'>) => (i.dari === i.sampai ? fmtD(i.dari) : `${fmtD(i.dari)} – ${fmtD(i.sampai)}`);
function StatusIzin({ i }: { i: Izin }) {
  return <span className={`pill ${i.status === 'disetujui' ? 'good' : i.status === 'ditolak' ? 'bad' : 'warn'}`}>{i.status === 'menunggu' ? 'Menunggu' : i.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}</span>;
}

/* pemilik & admin: pengajuan yang menunggu keputusan + riwayat */
export function IzinStaff() {
  const { d, run } = useDash();
  const [semua, setSemua] = useState(false);
  const menunggu = d.izin.filter(i => i.status === 'menunggu');
  const riwayat = d.izin.filter(i => i.status !== 'menunggu').slice(0, semua ? 100 : 6);
  if (!d.izin.length) return null;
  return (
    <div className="panel" style={{ marginBottom: 16, borderColor: menunggu.length ? 'var(--warn)' : undefined }}>
      <h3>Pengajuan izin / sakit{menunggu.length ? ` · ${menunggu.length} menunggu` : ''}</h3>
      <ul className="list">
        {menunggu.map(i => (
          <li key={i.id}>
            <div className="main"><b>{i.nama}</b> · {i.jenis} · {tanggalIzin(i)}<div className="meta">{i.alasan} · diajukan {new Date(i.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })}</div></div>
            <span className="actions">
              <Button size="sm" onClick={() => run(putuskanIzin(i.id, true), `${i.nama}: izin disetujui`)}>Setujui</Button>
              <Button size="sm" variant="outline" onClick={() => run(putuskanIzin(i.id, false), `${i.nama}: izin ditolak`)}>Tolak</Button>
            </span>
          </li>
        ))}
        {riwayat.map(i => (
          <li key={i.id}>
            <div className="main">{i.nama} · {i.jenis} · {tanggalIzin(i)}<div className="meta">{i.alasan}{i.diputus ? ` · oleh ${i.diputus.oleh}` : ''}</div></div>
            <StatusIzin i={i} />
          </li>
        ))}
      </ul>
      {d.izin.filter(i => i.status !== 'menunggu').length > 6 && <button className="linkbtn" onClick={() => setSemua(!semua)}>{semua ? 'Tampilkan sedikit' : 'Lihat semua riwayat'}</button>}
    </div>
  );
}

/* karyawan: tombol ajukan + daftar pengajuannya */
export function IzinSaya() {
  const { d, open, run } = useDash();
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3>Izin / sakit <Button size="sm" onClick={() => open({ kind: 'izin' })}>+ Ajukan izin / sakit</Button></h3>
      <p className="hint" style={{ marginTop: 0 }}>Untuk hari ini, ajukan sebelum jam masuk. Pengajuan disetujui atau ditolak oleh admin / pemilik.</p>
      {d.izin.length ? (
        <ul className="list">
          {d.izin.slice(0, 20).map(i => (
            <li key={i.id}>
              <div className="main"><b>{i.jenis}</b> · {tanggalIzin(i)}<div className="meta">{i.alasan}{i.diputus ? ` · diputuskan ${i.diputus.oleh}` : ''}</div></div>
              <span className="actions"><StatusIzin i={i} />{i.status === 'menunggu' && <Button size="xs" variant="ghost" onClick={() => run(batalIzin(i.id), 'Pengajuan dibatalkan')}>Batalkan</Button>}</span>
            </li>
          ))}
        </ul>
      ) : <div className="empty">Belum ada pengajuan.</div>}
    </div>
  );
}

export function AjukanIzinDialog({ onClose }: { onClose: () => void }) {
  const { d, run } = useDash();
  const [dari, setDari] = useState(d.today);
  return (
    <FormDialog wide={false} title="Ajukan izin / sakit" submitLabel="Kirim pengajuan" onClose={onClose}
      onSubmit={form => { const f = formObj(form); return run(ajukanIzin({ dari: f.dari, sampai: f.sampai || f.dari, jenis: f.jenis, alasan: f.alasan }), 'Pengajuan terkirim — menunggu persetujuan'); }}>
      <div className="grid2">
        <label className="lbl">Jenis<select className="field" name="jenis" defaultValue="Sakit">{JENIS_IZIN.map(j => <option key={j}>{j}</option>)}</select></label>
        <span />
        <label className="lbl">Dari tanggal<input className="field" type="date" name="dari" value={dari} min={d.today} onChange={e => setDari(e.target.value)} required /></label>
        <label className="lbl">Sampai tanggal<input className="field" type="date" name="sampai" key={dari} defaultValue={dari} min={dari} /></label>
        <label className="lbl span2">Alasan<textarea className="field" name="alasan" required placeholder="mis. demam sejak semalam / ada acara keluarga" /></label>
      </div>
    </FormDialog>
  );
}
