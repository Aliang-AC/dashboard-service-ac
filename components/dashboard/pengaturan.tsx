'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { backupLengkapSekarang, backupNow, saveLokasi, saveSettings, setDriveFoto } from '@/app/actions';
import { formObj, useDash } from './ctx';
import { TEMPLATE_PENGINGAT } from './pelanggan';

/* Tab ini hanya tampil untuk pemilik. */
export function Pengaturan() {
  const { d, run } = useDash();
  const st = d.settings;
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="section-head">
        <div><h2>Pengaturan usaha</h2><p>Data ini dipakai di kop invoice, tanda tangan invoice resmi, dan jam absensi.</p></div>
      </div>
      <form className="panel" style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}
        onSubmit={async e => {
          e.preventDefault();
          const f = formObj(e.currentTarget);
          setBusy(true);
          await run(saveSettings({ nama: f.nama, alamat: f.alamat, hp: f.hp, jamMasuk: f.jamMasuk, jamMasukMinggu: f.jamMasukMinggu, rekening: f.rekening, templatePengingat: f.templatePengingat,
            rekeningInstansi: f.rekeningInstansi, penanggungJawab: f.penanggungJawab, jabatan: f.jabatan, email: f.email, npwp: f.npwp }), 'Pengaturan tersimpan');
          setBusy(false);
        }}>
        <div className="grid2">
          <label className="lbl span2">Nama usaha<input className="field" name="nama" defaultValue={st.nama || ''} placeholder="mis. Sejuk Jaya Service AC" /></label>
          <label className="lbl span2">Alamat<input className="field" name="alamat" defaultValue={st.alamat || ''} /></label>
          <label className="lbl">No. HP / WA usaha<input className="field" name="hp" defaultValue={st.hp || ''} /></label>
          <label className="lbl">Jam masuk Senin–Sabtu<input className="field" type="time" name="jamMasuk" defaultValue={st.jamMasuk || '08:00'} /></label>
          <label className="lbl">Jam masuk hari Minggu<input className="field" type="time" name="jamMasukMinggu" defaultValue={st.jamMasukMinggu || ''} /></label>
          <label className="lbl span2">Alamat lengkap (tampil di kop invoice)<span className="hint">mis. Jalan MT Haryono KM 5, Sintang, Kalimantan Barat 78614 — isi di kolom Alamat di atas.</span></label>
          <label className="lbl">Rekening pribadi (invoice perorangan)<textarea className="field" name="rekening" defaultValue={st.rekening || ''} placeholder="mis. BNI 123xxxx a/n ..." /></label>
          <label className="lbl">Rekening atas nama CV (invoice instansi)<textarea className="field" name="rekeningInstansi" defaultValue={st.rekeningInstansi || ''} placeholder="kosong = pakai rekening pribadi" /></label>
          <label className="lbl">Penanda tangan invoice resmi<input className="field" name="penanggungJawab" defaultValue={st.penanggungJawab || ''} placeholder="mis. Dedi" /></label>
          <label className="lbl">Jabatan<input className="field" name="jabatan" defaultValue={st.jabatan || ''} placeholder="mis. Direktur" /></label>
          <label className="lbl">Email usaha<input className="field" name="email" type="email" defaultValue={st.email || ''} placeholder="mis. cv.gloryteknik@gmail.com" /></label>
          <label className="lbl">NPWP (opsional)<input className="field" name="npwp" defaultValue={st.npwp || ''} placeholder="dicetak di kop invoice resmi" /></label>

        </div>
        <p className="hint">Daftar layanan &amp; tarif sekarang diatur di menu <b>Daftar Harga</b>.</p>
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
      <BackupLengkap />
    </div>
  );
}

/* backup lengkap mingguan (semua data, file JSON) ke Google Drive */
function BackupLengkap() {
  const { d, run } = useDash();
  const [busy, setBusy] = useState(false);
  const b = d.backupLengkap;
  const kapan = (at: number) => new Date(at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <h3>Backup lengkap mingguan ke Google Drive</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Setiap Senin dini hari, <b>semua data</b> (order, pelanggan & unit AC, stiker, stok, daftar harga, karyawan, absensi, tim, izin, invoice, riwayat)
        disimpan sebagai satu file di Drive: <b>Karyawan AI → Dashboard Bisnis → Backup Lengkap</b>. Disimpan 26 file terakhir (±6 bulan).
        File ini bisa dipakai untuk memulihkan atau memindahkan data ke sistem lain. Kunci rahasia & PIN tidak ikut disimpan.
      </p>
      <p style={{ margin: '0 0 12px' }}>
        Terakhir: {b ? (b.ok
          ? <b className="num">{kapan(b.at)} · {b.dokumen} data · {b.ukuranKb} KB</b>
          : <b style={{ color: 'var(--bad)' }}>gagal {kapan(b.at)} — {b.error}</b>) : <b>Belum pernah</b>}
      </p>
      <div className="actions">
        <Button disabled={busy} onClick={async () => { setBusy(true); await run(backupLengkapSekarang(), 'Backup lengkap tersimpan di Google Drive'); setBusy(false); }}>
          {busy ? 'Menyimpan…' : 'Backup lengkap sekarang'}
        </Button>
        {b?.ok && b.folder && <Button variant="outline" nativeButton={false} render={<a href={b.folder} target="_blank" rel="noopener noreferrer" />}>Buka folder Backup Lengkap</Button>}
      </div>
    </div>
  );
}
