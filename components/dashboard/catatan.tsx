'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteCatatan, saveCatatan, setCatatanDone } from '@/app/actions';
import { activeKar, karName, NOTE_CLS, NOTE_TYPES } from '@/lib/derive';
import { fmtD } from '@/lib/format';
import type { Catatan } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

export function CatatanView() {
  const { d, open, run } = useDash();
  const [showDone, setShowDone] = useState(false);
  const t = d.today;
  const all = d.catatan.slice().sort((a, b) => (a.tanggal || '9999').localeCompare(b.tanggal || '9999'));
  const openN = all.filter(n => !n.selesai);
  const done = all.filter(n => n.selesai).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const groups: [string, Catatan[]][] = [
    ['Terlambat', openN.filter(n => n.tanggal && n.tanggal < t)],
    ['Hari ini', openN.filter(n => n.tanggal === t)],
    ['Akan datang', openN.filter(n => n.tanggal && n.tanggal > t)],
    ['Tanpa tanggal', openN.filter(n => !n.tanggal)],
  ];

  const card = (n: Catatan) => {
    const late = !n.selesai && !!n.tanggal && n.tanggal < t;
    return (
      <div key={n.id} className={`note ${n.selesai ? 'done' : late ? 'overdue' : ''}`}>
        <div className="head">
          <span className={`pill ${NOTE_CLS[n.tipe] || ''}`}>{n.tipe}</span>
          {n.tanggal && <span className="num sm" style={late ? { color: 'var(--bad)' } : undefined}>{fmtD(n.tanggal)}{n.jam ? ' ' + n.jam : ''}</span>}
        </div>
        <b>{n.judul}</b>
        {n.isi && <p className="muted">{n.isi}</p>}
        <div className="foot">
          <span>{n.pelanggan}{n.untuk ? ` · untuk ${karName(d, n.untuk)}` : ''}</span>
          <span className="actions">
            {n.selesai
              ? <Button size="sm" variant="outline" onClick={() => run(setCatatanDone(n.id, false), 'Catatan dibuka lagi')}>Buka lagi</Button>
              : <Button size="sm" variant="secondary" onClick={() => run(setCatatanDone(n.id, true), 'Ditandai selesai')}>Selesai</Button>}
            <Button size="sm" variant="outline" onClick={() => open({ kind: 'note', id: n.id })}>Ubah</Button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="section-head">
        <div><h2>Catatan &amp; pengingat</h2><p>Untuk kerjaan yang belum selesai, pelanggan yang minta dijadwal ulang, atau hal yang tidak boleh lupa.</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'note' })}>+ Catatan baru</Button></div>
      </div>
      {openN.length ? (
        groups.filter(g => g[1].length).map(([l, arr]) => (
          <div key={l}><div className="group-title">{l} · {arr.length}</div><div className="notes">{arr.map(card)}</div></div>
        ))
      ) : (
        <div className="panel empty"><b>Tidak ada catatan terbuka</b>Contoh: “Telepon Pak Budi, jadwal ulang cuci AC minggu depan” atau “Ambil kompresor di bengkel servis”.</div>
      )}
      {done.length > 0 && (
        <>
          <div className="group-title"><button className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Sembunyikan' : 'Tampilkan'} {done.length} catatan selesai</button></div>
          {showDone && <div className="notes">{done.slice(0, 40).map(card)}</div>}
        </>
      )}
    </>
  );
}

export function NoteDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run } = useDash();
  const n = id ? d.catatan.find(x => x.id === id) : undefined;
  const pelanggan = [...new Set(d.orders.map(o => o.pelanggan))].slice(0, 200);
  return (
    <FormDialog
      title={n ? 'Ubah catatan' : 'Catatan baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(saveCatatan(n?.id || null, { tipe: f.tipe, untuk: f.untuk, judul: f.judul, isi: f.isi, tanggal: f.tanggal, jam: f.jam, pelanggan: f.pelanggan }), n ? 'Catatan diperbarui' : 'Catatan tersimpan');
      }}
      onDelete={n ? () => run(deleteCatatan(n.id), 'Catatan dihapus') : undefined}
    >
      <div className="grid2">
        <label className="lbl">Jenis<select className="field" name="tipe" defaultValue={n?.tipe || 'Pengingat'}>{NOTE_TYPES.map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="lbl">Untuk
          <select className="field" name="untuk" defaultValue={n?.untuk || ''}>
            <option value="">Semua</option>
            {activeKar(d).map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
        <label className="lbl span2">Judul<input className="field" name="judul" required defaultValue={n?.judul || ''} placeholder="mis. Jadwal ulang cuci AC Pak Budi" autoFocus /></label>
        <label className="lbl span2">Detail<textarea className="field" name="isi" defaultValue={n?.isi || ''} /></label>
        <label className="lbl">Tanggal (jatuh tempo)<input className="field" type="date" name="tanggal" defaultValue={n?.tanggal || ''} /></label>
        <label className="lbl">Jam<input className="field" type="time" name="jam" defaultValue={n?.jam || ''} /></label>
        <label className="lbl span2">Pelanggan terkait<input className="field" name="pelanggan" defaultValue={n?.pelanggan || ''} list="pelList" /></label>
        <datalist id="pelList">{pelanggan.map(p => <option key={p} value={p} />)}</datalist>
      </div>
    </FormDialog>
  );
}
