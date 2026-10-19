'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { backupNow, saveLokasi, saveSettings, setDriveFoto } from '@/app/actions';
import { layanan } from '@/lib/derive';
import { formObj, useDash } from './ctx';
import { TEMPLATE_PENGINGAT } from './pelanggan';

/* Tab ini hanya tampil untuk pemilik. */
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
          await run(saveSettings({ nama: f.nama, alamat: f.alamat, hp: f.hp, jamMasuk: f.jamMasuk, rekening: f.rekening, layanan: lay, templatePengingat: f.templatePengingat }), 'Pengaturan tersimpan');
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
        <label className="lbl">Pesan WhatsApp pengingat servis
          <textarea className="field" name="templatePengingat" style={{ minHeight: 90 }} defaultValue={st.templatePengingat || TEMPLATE_PENGINGAT} />
        </label>
        <p className="hint">Kata yang otomatis diganti: <span className="mono">{'{nama}'}</span> nama pelanggan, <span className="mono">{'{usaha}'}</span> nama usaha, <span className="mono">{'{terakhir}'}</span> tanggal servis terakhir, <span className="mono">{'{unit}'}</span> daftar unit AC.</p>
        <div><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button></div>
      </form>

      <LokasiBengkel />
      <FotoDrive />
      <Backup />
    </>
  );
}

/* Titik bengkel & radius untuk absen QR. */
function LokasiBengkel() {
  const { d, run } = useDash();
  const [lat, setLat] = useState(String(d.lokasi?.lat ?? ''));
  const [lng, setLng] = useState(String(d.lokasi?.lng ?? ''));
  const [radius, setRadius] = useState(String(d.lokasi?.radius ?? 100));
  const [busy, setBusy] = useState(false);
  const pakaiLokasiSaya = () => {
    if (!('geolocation' in navigator)) return toast.error('Browser ini tidak mendukung GPS.');
    toast.info('Membaca lokasi HP…');
    navigator.geolocation.getCurrentPosition(
      p => { setLat(p.coords.latitude.toFixed(7)); setLng(p.coords.longitude.toFixed(7)); toast.success(`Lokasi terbaca (akurasi ±${Math.round(p.coords.accuracy)} m). Klik Simpan lokasi.`); },
      () => toast.error('Lokasi tidak terbaca. Izinkan akses lokasi lalu coba lagi.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  return (
    <form className="panel" style={{ maxWidth: 720, marginTop: 16 }}
      onSubmit={async e => { e.preventDefault(); setBusy(true); await run(saveLokasi({ lat: +lat, lng: +lng, radius: +radius }), 'Lokasi bengkel tersimpan'); setBusy(false); }}>
      <h3>Lokasi bengkel untuk absen</h3>
      <p className="hint" style={{ marginBottom: 10 }}>Absen lewat QR hanya diterima kalau HP karyawan berada dalam radius ini dari titik bengkel.</p>
      <div className="grid2">
        <label className="lbl">Latitude<input className="field mono" value={lat} onChange={e => setLat(e.target.value)} required /></label>
        <label className="lbl">Longitude<input className="field mono" value={lng} onChange={e => setLng(e.target.value)} required /></label>
        <label className="lbl">Radius (meter)<input className="field" type="number" min={20} max={1000} value={radius} onChange={e => setRadius(e.target.value)} required /></label>
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan lokasi'}</Button>
        <Button type="button" variant="outline" onClick={pakaiLokasiSaya}>Pakai lokasi saya sekarang</Button>
        {lat && lng && <Button variant="outline" nativeButton={false} render={<a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" />}>Lihat di Google Maps</Button>}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Tip: kalau pin Google Maps meleset, berdiri di tengah bengkel lalu klik “Pakai lokasi saya sekarang” → Simpan lokasi.</p>
    </form>
  );
}

/* Sambungkan skrip Apps Script tempat foto bukti kerja disimpan. */
function FotoDrive() {
  const { d, run } = useDash();
  const [busy, setBusy] = useState(false);
  return (
    <form className="panel" style={{ maxWidth: 720, marginTop: 16 }}
      onSubmit={async e => {
        e.preventDefault();
        const f = formObj(e.currentTarget);
        setBusy(true);
        const r = await setDriveFoto(f.link);
        await run(Promise.resolve(r.ok ? { ok: true as const } : r), r.ok ? `Tersambung — foto disimpan ke ${r.data.nama}` : undefined);
        setBusy(false);
      }}>
      <h3>Foto bukti kerja {d.fotoAktif ? <span className="pill good">Aktif</span> : <span className="pill warn">Belum disambungkan</span>}</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Foto sebelum-sesudah dari teknisi disimpan di Google Drive Anda (Karyawan AI → Dashboard Bisnis → Foto, per bulan)
        lewat skrip Google Apps Script yang berjalan atas nama akun Drive Anda. Tempel URL Web app skrip di bawah.
      </p>
      <div className="toolbar">
        <input className="field" name="link" required placeholder="https://script.google.com/macros/s/…/exec" style={{ flex: 1, minWidth: 240 }} />
        <Button type="submit" disabled={busy}>{busy ? 'Mengecek…' : d.fotoAktif ? 'Ganti' : 'Sambungkan'}</Button>
      </div>
    </form>
  );
}

/* Salinan semua data ke Google Sheet, otomatis tiap tengah malam WIB. */
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
        Setiap tengah malam WIB: karyawan yang tidak absen ditandai Alpa, absensi kemarin ditambahkan ke arsip “Absensi Karyawan”,
        lalu semua data disalin ke sheet backup (isi sheet backup ditimpa, jangan diedit langsung).
      </p>
      <p style={{ margin: '0 0 12px' }}>Backup terakhir: <b className="num">{last}</b></p>
      <div className="actions">
        <Button disabled={busy} onClick={async () => { setBusy(true); await run(backupNow(), 'Backup selesai'); setBusy(false); }}>
          {busy ? 'Membackup…' : 'Backup sekarang'}
        </Button>
        {d.backupUrl && <Button variant="outline" nativeButton={false} render={<a href={d.backupUrl} target="_blank" rel="noopener noreferrer" />}>Buka sheet backup</Button>}
        {d.arsipUrl && <Button variant="outline" nativeButton={false} render={<a href={d.arsipUrl} target="_blank" rel="noopener noreferrer" />}>Buka arsip absensi</Button>}
      </div>
    </div>
  );
}
