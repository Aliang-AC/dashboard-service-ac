'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addPengguna, backupNow, removePengguna, saveSettings } from '@/app/actions';
import { layanan } from '@/lib/derive';
import { formObj, useDash } from './ctx';

export function Pengaturan() {
  const { d, run } = useDash();
  const st = d.settings, lay = layanan(d);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="section-head">
        <div><h2>Pengaturan usaha</h2><p>Data ini dipakai di kop invoice, jam absensi, dan daftar layanan beserta tarifnya.</p></div>
      </div>
      <form className="panel" style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}
        onSubmit={async e => {
          e.preventDefault();
          const f = formObj(e.currentTarget);
          /* Satu layanan per baris: "Nama = harga" */
          const lay = f.layanan.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
            const i = l.lastIndexOf('=');
            return i > 0 ? { nama: l.slice(0, i).trim(), harga: +l.slice(i + 1).replace(/[^\d]/g, '') || 0 } : { nama: l, harga: 0 };
          });
          setBusy(true);
          await run(saveSettings({ nama: f.nama, alamat: f.alamat, hp: f.hp, jamMasuk: f.jamMasuk, rekening: f.rekening, layanan: lay }), 'Pengaturan tersimpan');
          setBusy(false);
        }}>
        <div className="grid2">
          <label className="lbl span2">Nama usaha<input className="field" name="nama" defaultValue={st.nama || ''} placeholder="mis. Sejuk Jaya Service AC" /></label>
          <label className="lbl span2">Alamat<input className="field" name="alamat" defaultValue={st.alamat || ''} /></label>
          <label className="lbl">No. HP / WA usaha<input className="field" name="hp" defaultValue={st.hp || ''} /></label>
          <label className="lbl">Jam masuk kerja<input className="field" type="time" name="jamMasuk" defaultValue={st.jamMasuk || '08:00'} /></label>
          <label className="lbl span2">Info pembayaran di invoice<textarea className="field" name="rekening" defaultValue={st.rekening || ''} placeholder="mis. Transfer BCA 123xxxx a.n. ..." /></label>
          <label className="lbl span2">Daftar layanan &amp; tarif per unit
            <textarea className="field mono" name="layanan" style={{ minHeight: 160 }} defaultValue={lay.map(l => `${l.nama} = ${+l.harga || 0}`).join('\n')} />
          </label>
        </div>
        <p className="hint">Satu layanan per baris, format <span className="mono">Nama = harga</span>. Contoh: <span className="mono">Cuci AC 1/2–1 PK = 75000</span>. Tarif otomatis terisi di order dan bisa diubah per order.</p>
        <div><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button></div>
      </form>

      {d.me.owner && <Akses />}
      {d.me.owner && <Backup />}
    </>
  );
}

/* Hanya pemilik: salinan semua data ke Google Sheet, otomatis tiap tengah malam WIB. */
function Backup() {
  const { d, run } = useDash();
  const [busy, setBusy] = useState(false);
  const last = d.backup
    ? new Date(d.backup.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ` WIB · ${d.backup.rows} baris`
    : 'Belum pernah';
  return (
    <div className="panel" style={{ maxWidth: 720, marginTop: 16 }}>
      <h3>Backup ke Google Sheets</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Semua data (order, stok, mutasi stok, karyawan, absensi, catatan) disalin otomatis ke Google Sheet setiap tengah malam WIB.
        Isi sheet ditimpa setiap backup, jadi jangan diedit langsung di sana.
      </p>
      <p style={{ margin: '0 0 12px' }}>Backup terakhir: <b className="num">{last}</b></p>
      <div className="actions">
        <Button disabled={busy} onClick={async () => { setBusy(true); await run(backupNow(), 'Backup selesai'); setBusy(false); }}>
          {busy ? 'Membackup…' : 'Backup sekarang'}
        </Button>
        {d.backupUrl && (
          <Button variant="outline" nativeButton={false} render={<a href={d.backupUrl} target="_blank" rel="noopener noreferrer" />}>Buka Google Sheet</Button>
        )}
      </div>
    </div>
  );
}

/* Hanya pemilik: daftar email yang boleh masuk ke dashboard. */
function Akses() {
  const { d, run } = useDash();
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <div className="panel" style={{ maxWidth: 720, marginTop: 16 }}>
      <h3>Akses karyawan</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Tambahkan email karyawan di sini. Setelah itu, karyawan membuka alamat dashboard ini, klik <b>Daftar</b> memakai email yang sama, lalu bisa ikut mengisi data.
        Kamu (<span className="mono">{d.me.email}</span>) masuk sebagai pemilik.
      </p>
      <form className="toolbar" onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget, f = formObj(form);
        if (await run(addPengguna(f.email, f.nama), 'Akses ditambahkan')) form.reset();
      }}>
        <input className="field" style={{ flex: 2, minWidth: 200 }} type="email" name="email" required placeholder="email karyawan" />
        <input className="field" style={{ flex: 1, minWidth: 140 }} name="nama" placeholder="nama (opsional)" />
        <Button type="submit">+ Beri akses</Button>
      </form>
      {d.pengguna.length ? (
        <ul className="list">
          {d.pengguna.slice().sort((a, b) => a.email.localeCompare(b.email)).map(p => (
            <li key={p.email}>
              <div className="main"><b>{p.nama || p.email}</b><div className="meta mono">{p.email}</div></div>
              <Button size="sm" variant="destructive" onClick={async () => {
                if (armed !== p.email) return setArmed(p.email);
                await run(removePengguna(p.email), 'Akses dicabut');
                setArmed(null);
              }}>{armed === p.email ? 'Klik lagi untuk cabut' : 'Cabut akses'}</Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">Belum ada karyawan yang diberi akses.</div>
      )}
    </div>
  );
}
