'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { absen, saveKaryawan } from '@/app/actions';
import { ABS_CLS, absToday, activeKar, karName } from '@/lib/derive';
import { fmtLong, fmtMonth, monthKey } from '@/lib/format';
import { ABS_ST, type AbsStatus } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

export function AbsensiView() {
  const { d, open, run } = useDash();
  const kar = activeKar(d), recs = absToday(d), jm = d.settings.jamMasuk || '08:00';
  const [month, setMonth] = useState(d.today.slice(0, 7));
  const days = d.absensi.filter(a => monthKey(a.id) === month);
  const recap = d.karyawan
    .map(k => {
      const c = { Hadir: 0, Izin: 0, Sakit: 0, Libur: 0, Alpa: 0, telat: 0 };
      days.forEach(day => {
        const r = day.records?.[k.id];
        if (r?.status) { c[r.status]++; if (r.status === 'Hadir' && r.masuk && r.masuk > jm) c.telat++; }
      });
      return { k, c };
    })
    .filter(x => !x.k.nonaktif || Object.values(x.c).some(Boolean));
  const months = [...new Set([d.today.slice(0, 7), ...d.absensi.map(a => monthKey(a.id))])].sort().reverse();

  return (
    <>
      <div className="section-head">
        <div><h2>Absensi karyawan</h2><p>Hari ini, {fmtLong(d.today)}. Jam masuk normal {jm}; lewat dari itu ditandai telat.</p></div>
        <div className="actions"><Button variant="outline" onClick={() => open({ kind: 'kar' })}>+ Karyawan</Button></div>
      </div>
      {kar.length ? (
        <div className="att">
          {kar.map(k => {
            const r = recs[k.id] || {};
            const late = !!r.masuk && r.masuk > jm;
            const canIn = !r.masuk && !['Izin', 'Sakit', 'Libur'].includes(r.status || '');
            return (
              <div className="att-card" key={k.id}>
                <div className="who">
                  <b className="text-[1.05rem]">{k.nama}</b>
                  {r.status ? <span className={`pill ${ABS_CLS[r.status] || ''}`}>{r.status}{late ? ' · telat' : ''}</span> : <span className="pill">Belum absen</span>}
                </div>
                <div className="sm">{k.peran}</div>
                <div className="times"><div><span>Masuk</span>{r.masuk || '—'}</div><div><span>Pulang</span>{r.pulang || '—'}</div></div>
                <div className="actions">
                  {canIn && <Button size="sm" onClick={() => run(absen(k.id, 'in'), 'Absen masuk tercatat')}>Absen masuk</Button>}
                  {r.masuk && !r.pulang && <Button size="sm" variant="secondary" onClick={() => run(absen(k.id, 'out'), 'Absen pulang tercatat')}>Absen pulang</Button>}
                  <Button size="sm" variant="outline" onClick={() => open({ kind: 'abs', id: k.id })}>Izin / ubah</Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel empty"><b>Belum ada karyawan</b>Tambahkan teknisi dan helper lewat tombol “Karyawan” agar bisa absen dan dipilih di order.</div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Rekap bulanan
          <select className="field" style={{ width: 'auto' }} value={month} onChange={e => setMonth(e.target.value)} aria-label="Pilih bulan">
            {months.map(x => <option key={x} value={x}>{fmtMonth(x)}</option>)}
          </select>
        </h3>
        {recap.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Nama</th><th className="r">Hadir</th><th className="r">Telat</th><th className="r">Izin</th><th className="r">Sakit</th><th className="r">Libur</th><th className="r">Alpa</th></tr></thead>
              <tbody>
                {recap.map(({ k, c }) => (
                  <tr key={k.id}>
                    <td>{k.nama}{k.nonaktif && <> <span className="pill">nonaktif</span></>}</td>
                    <td className="r num">{c.Hadir}</td><td className="r num">{c.telat}</td><td className="r num">{c.Izin}</td>
                    <td className="r num">{c.Sakit}</td><td className="r num">{c.Libur}</td><td className="r num">{c.Alpa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Rekap muncul setelah ada karyawan yang absen.</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Data karyawan</h3>
        {d.karyawan.length ? (
          <ul className="list">
            {d.karyawan.slice().sort((a, b) => +!!a.nonaktif - +!!b.nonaktif || a.nama.localeCompare(b.nama)).map(k => (
              <li key={k.id}>
                <div className="main"><b>{k.nama}</b>{k.nonaktif && <> <span className="pill">nonaktif</span></>}<div className="meta">{k.peran}{k.hp ? ' · ' + k.hp : ''}</div></div>
                <Button size="sm" variant="outline" onClick={() => open({ kind: 'kar', id: k.id })}>Ubah</Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Belum ada data.</div>
        )}
      </div>
    </>
  );
}

export function AbsDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const r = absToday(d)[id] || {};
  return (
    <FormDialog wide={false} title={`Absensi · ${karName(d, id)}`} onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(absen(id, 'edit', { status: f.status as AbsStatus, ket: f.ket, masuk: f.masuk, pulang: f.pulang }), 'Absensi tercatat');
      }}>
      <div className="grid2">
        <label className="lbl">Status<select className="field" name="status" defaultValue={r.status || 'Hadir'}>{ABS_ST.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="lbl">Keterangan<input className="field" name="ket" defaultValue={r.ket || ''} /></label>
        <label className="lbl">Jam masuk<input className="field" type="time" name="masuk" defaultValue={r.masuk || ''} /></label>
        <label className="lbl">Jam pulang<input className="field" type="time" name="pulang" defaultValue={r.pulang || ''} /></label>
      </div>
    </FormDialog>
  );
}

export function KarDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run } = useDash();
  const k = id ? d.karyawan.find(x => x.id === id) : undefined;
  return (
    <FormDialog wide={false} title={k ? 'Ubah karyawan' : 'Karyawan baru'} onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(saveKaryawan(k?.id || null, { nama: f.nama, peran: f.peran, hp: f.hp, nonaktif: !!f.nonaktif }), k ? 'Data karyawan diperbarui' : 'Karyawan ditambahkan');
      }}>
      <div className="grid2">
        <label className="lbl span2">Nama<input className="field" name="nama" required defaultValue={k?.nama || ''} autoFocus /></label>
        <label className="lbl">Peran<input className="field" name="peran" defaultValue={k?.peran || ''} placeholder="Teknisi / Helper / Admin" /></label>
        <label className="lbl">No. HP<input className="field" name="hp" inputMode="tel" defaultValue={k?.hp || ''} /></label>
        {k && (
          <label className="lbl span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="nonaktif" defaultChecked={!!k.nonaktif} /> Nonaktif (sudah tidak bekerja)
          </label>
        )}
      </div>
    </FormDialog>
  );
}
