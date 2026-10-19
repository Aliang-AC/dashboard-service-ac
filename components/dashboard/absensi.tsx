'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { absenManual, buatAkun, hapusAkun, liburSemua, resetPassword, saveKaryawan } from '@/app/actions';
import { ABS_CLS, karName } from '@/lib/derive';
import { addDays, fmtD, fmtLong, fmtMonth, monthKey } from '@/lib/format';
import { ABS_ST, HARI, type AbsRecord, type AbsStatus, type AllData, type Karyawan } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

/* ---------- aturan tampilan ---------- */
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const telatMenit = (r: AbsRecord | undefined, jamMasuk: string) =>
  r?.status === 'Hadir' && r.masuk ? Math.max(0, toMin(r.masuk) - toMin(jamMasuk)) : 0;
const hariDari = (tgl: string) => new Date(tgl + 'T00:00:00Z').getUTCDay();
const liburRutin = (k: Karyawan, tgl: string) => (k.liburMingguan || []).includes(hariDari(tgl));
const recOf = (d: AllData, tgl: string, kid: string) => d.absensi.find(a => a.id === tgl)?.records?.[kid];
/* baris merah: Alpa, telat, atau (hari sudah lewat) tidak absen pulang */
const isMerah = (r: AbsRecord | undefined, jamMasuk: string, lewat: boolean) =>
  r?.status === 'Alpa' || telatMenit(r, jamMasuk) > 0 || (lewat && r?.status === 'Hadir' && !!r.masuk && !r.pulang);
const mapsLink = (l?: { lat: number; lng: number }) => (l ? `https://www.google.com/maps?q=${l.lat},${l.lng}` : '');

function StatusPill({ r, k, tgl, jamMasuk }: { r?: AbsRecord; k?: Karyawan; tgl: string; jamMasuk: string }) {
  if (r?.status) {
    const t = telatMenit(r, jamMasuk);
    return <span className={`pill ${t ? 'bad' : ABS_CLS[r.status] || ''}`}>{r.status}{t ? ` · telat ${t} mnt` : ''}</span>;
  }
  if (k && liburRutin(k, tgl)) return <span className="pill">Libur rutin</span>;
  return <span className="pill">Belum absen</span>;
}

export function AbsensiView() {
  const { d } = useDash();
  return d.me.peran === 'karyawan' ? <AbsensiSaya /> : <AbsensiStaff />;
}

/* ================= pemilik & admin ================= */
function AbsensiStaff() {
  const { d, open } = useDash();
  const jm = d.settings.jamMasuk || '08:00';
  const [tgl, setTgl] = useState(d.today);
  const [month, setMonth] = useState(d.today.slice(0, 7));
  const aktif = d.karyawan.filter(k => !k.nonaktif).sort((a, b) => a.nama.localeCompare(b.nama));
  const lewat = tgl < d.today;

  /* rekap bulanan */
  const days = d.absensi.filter(a => monthKey(a.id) === month);
  const recap = d.karyawan.map(k => {
    const c = { Hadir: 0, Izin: 0, Sakit: 0, Libur: 0, Alpa: 0, telat: 0, menit: 0, tanpaPulang: 0 };
    days.forEach(day => {
      const r = day.records?.[k.id];
      if (!r?.status) return;
      c[r.status]++;
      const t = telatMenit(r, jm);
      if (t) { c.telat++; c.menit += t; }
      if (r.status === 'Hadir' && r.masuk && !r.pulang && day.id < d.today) c.tanpaPulang++;
    });
    return { k, c };
  }).filter(x => !x.k.nonaktif || Object.values(x.c).some(Boolean));
  const months = [...new Set([d.today.slice(0, 7), ...d.absensi.map(a => monthKey(a.id))])].sort().reverse();
  const red = { color: 'var(--bad)', fontWeight: 600 } as const;

  return (
    <>
      <div className="section-head">
        <div><h2>Absensi karyawan</h2><p>Absen masuk & pulang lewat scan QR di bengkel (radius {d.lokasi?.radius ?? 100} m). Jam masuk {jm}; lewat semenit pun ditandai telat.</p></div>
        <div className="actions">
          <Button nativeButton={false} render={<a href="/layar-absen" target="_blank" rel="noopener" />}>Buka Layar Absen</Button>
          <Button variant="outline" onClick={() => open({ kind: 'libur' })}>Tandai libur</Button>
          <Button variant="outline" onClick={() => open({ kind: 'kar' })}>+ Karyawan</Button>
        </div>
      </div>

      <div className="panel">
        <h3>
          <span>{tgl === d.today ? 'Hari ini' : fmtLong(tgl)}</span>
          <span className="actions">
            <Button size="sm" variant="outline" onClick={() => setTgl(addDays(tgl, -1))} aria-label="Hari sebelumnya">‹</Button>
            <input type="date" className="field" style={{ width: 'auto' }} value={tgl} max={d.today} onChange={e => e.target.value && setTgl(e.target.value)} aria-label="Pilih tanggal" />
            <Button size="sm" variant="outline" disabled={tgl >= d.today} onClick={() => setTgl(addDays(tgl, 1))} aria-label="Hari berikutnya">›</Button>
          </span>
        </h3>
        {aktif.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Nama</th><th>Status</th><th>Masuk</th><th>Pulang</th><th className="r">Jarak</th><th>Cara</th><th>Keterangan</th><th></th></tr></thead>
              <tbody>
                {aktif.map(k => {
                  const r = recOf(d, tgl, k.id);
                  const merah = isMerah(r, jm, lewat);
                  const bisaEdit = d.me.peran === 'owner' || k.id !== d.me.karyawanId;
                  return (
                    <tr key={k.id} className={merah ? 'out' : ''} style={merah ? { background: 'var(--bad-soft)' } : undefined}>
                      <td><b>{k.nama}</b><div className="sm">{k.peran}</div></td>
                      <td><StatusPill r={r} k={k} tgl={tgl} jamMasuk={jm} /></td>
                      <td className="num" style={telatMenit(r, jm) ? red : undefined}>{r?.masuk || '—'}</td>
                      <td className="num" style={lewat && r?.status === 'Hadir' && r.masuk && !r.pulang ? red : undefined}>{r?.pulang || (lewat && r?.status === 'Hadir' ? 'tidak absen' : '—')}</td>
                      <td className="r num">{r?.masukLoc ? <a className="linkbtn" href={mapsLink(r.masukLoc)} target="_blank" rel="noopener noreferrer">{r.masukLoc.jarak} m</a> : '—'}</td>
                      <td className="sm">{r?.via ? `${r.via}${r.oleh ? ' · ' + r.oleh : ''}` : ''}</td>
                      <td className="sm">{r?.ket}</td>
                      <td>{bisaEdit && <Button size="sm" variant="outline" onClick={() => open({ kind: 'abs', id: k.id, tanggal: tgl })}>Input manual</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><b>Belum ada karyawan</b>Tambahkan karyawan lewat tombol “+ Karyawan”, lalu buatkan akun login nomor HP-nya.</div>
        )}
        <p className="hint" style={{ marginTop: 8 }}>Baris merah = telat, Alpa, atau tidak absen pulang. Klik angka jarak untuk melihat titik absen di Google Maps.</p>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Rekap bulanan
          <select className="field" style={{ width: 'auto' }} value={month} onChange={e => setMonth(e.target.value)} aria-label="Pilih bulan">
            {months.map(x => <option key={x} value={x}>{fmtMonth(x)}</option>)}
          </select>
        </h3>
        {recap.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Nama</th><th className="r">Hadir</th><th className="r">Telat</th><th className="r">Total telat</th><th className="r">Tanpa pulang</th><th className="r">Izin</th><th className="r">Sakit</th><th className="r">Libur</th><th className="r">Alpa</th></tr></thead>
              <tbody>
                {recap.map(({ k, c }) => (
                  <tr key={k.id}>
                    <td>{k.nama}{k.nonaktif && <> <span className="pill">nonaktif</span></>}</td>
                    <td className="r num">{c.Hadir}</td>
                    <td className="r num" style={c.telat ? red : undefined}>{c.telat}×</td>
                    <td className="r num" style={c.menit ? red : undefined}>{c.menit} mnt</td>
                    <td className="r num" style={c.tanpaPulang ? red : undefined}>{c.tanpaPulang}</td>
                    <td className="r num">{c.Izin}</td><td className="r num">{c.Sakit}</td><td className="r num">{c.Libur}</td>
                    <td className="r num" style={c.Alpa ? red : undefined}>{c.Alpa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Rekap muncul setelah ada karyawan yang absen.</div>
        )}
        {d.arsipUrl && <p className="hint" style={{ marginTop: 8 }}>Arsip permanen per hari: <a className="linkbtn" href={d.arsipUrl} target="_blank" rel="noopener noreferrer">Google Sheet “Absensi Karyawan”</a> (ditambah otomatis tiap 00.00 WIB).</p>}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Data karyawan & akun login</h3>
        {d.karyawan.length ? (
          <ul className="list">
            {d.karyawan.slice().sort((a, b) => +!!a.nonaktif - +!!b.nonaktif || a.nama.localeCompare(b.nama)).map(k => {
              const kunci = d.me.peran !== 'owner' && k.akun?.peran === 'admin';
              return (
                <li key={k.id}>
                  <div className="main">
                    <b>{k.nama}</b>{k.nonaktif && <> <span className="pill">nonaktif</span></>}
                    {k.akun ? <> <span className={`pill ${k.akun.peran === 'admin' ? 'accent' : 'brand'}`}>{k.akun.peran === 'admin' ? 'Admin' : 'Karyawan'} · {k.akun.username}</span></> : <> <span className="pill warn">Belum punya akun</span></>}
                    <div className="meta">{k.peran}{k.hp ? ' · ' + k.hp : ''}{k.liburMingguan?.length ? ' · libur rutin: ' + k.liburMingguan.map(h => HARI[h]).join(', ') : ''}</div>
                  </div>
                  <span className="actions">
                    {!kunci && <Button size="sm" variant={k.akun ? 'outline' : 'default'} onClick={() => open({ kind: 'akun', id: k.id })}>{k.akun ? 'Akun' : 'Buat akun'}</Button>}
                    <Button size="sm" variant="outline" onClick={() => open({ kind: 'kar', id: k.id })}>Ubah</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">Belum ada data.</div>
        )}
      </div>
    </>
  );
}

/* ================= karyawan ================= */
function AbsensiSaya() {
  const { d } = useDash();
  const kid = d.me.karyawanId || '';
  const k = d.karyawan.find(x => x.id === kid);
  const jm = d.settings.jamMasuk || '08:00';
  const r = recOf(d, d.today, kid);
  const bulan = d.absensi.filter(a => monthKey(a.id) === d.today.slice(0, 7) && a.records?.[kid]).sort((a, b) => b.id.localeCompare(a.id));
  const t = telatMenit(r, jm);

  if (!k) return <div className="panel empty"><b>Akun belum terhubung</b>Hubungi admin untuk menghubungkan akun Anda ke data karyawan.</div>;
  return (
    <>
      <div className="section-head"><div><h2>Absensi saya</h2><p>Halo, {k.nama}. Jam masuk {jm}.</p></div></div>
      <div className="panel" style={t ? { borderColor: 'var(--bad)', background: 'var(--bad-soft)' } : undefined}>
        <h3>Hari ini · {fmtLong(d.today)} <StatusPill r={r} k={k} tgl={d.today} jamMasuk={jm} /></h3>
        <div className="att-card" style={{ border: 0, padding: 0, background: 'transparent' }}>
          <div className="times"><div><span>Masuk</span>{r?.masuk || '—'}</div><div><span>Pulang</span>{r?.pulang || '—'}</div></div>
        </div>
        <p style={{ margin: '12px 0 0' }}>
          {!r?.masuk ? <><b>Cara absen masuk:</b> sampai di bengkel, buka <b>kamera HP</b> dan arahkan ke QR di <b>Layar Absen</b>, lalu ketuk link yang muncul dan izinkan lokasi.</>
            : !r.pulang ? <><b>Absen pulang:</b> scan lagi QR di Layar Absen bengkel saat pulang.</>
              : 'Absensi hari ini sudah lengkap. Terima kasih!'}
        </p>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Riwayat bulan ini</h3>
        {bulan.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Tanggal</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Keterangan</th></tr></thead>
              <tbody>
                {bulan.map(a => {
                  const x = a.records[kid];
                  const merah = isMerah(x, jm, a.id < d.today);
                  return (
                    <tr key={a.id} style={merah ? { background: 'var(--bad-soft)' } : undefined}>
                      <td className="num">{fmtD(a.id)}</td><td><StatusPill r={x} tgl={a.id} jamMasuk={jm} /></td>
                      <td className="num">{x.masuk || '—'}</td><td className="num">{x.pulang || '—'}</td><td className="sm">{x.ket}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Belum ada absensi bulan ini.</div>}
      </div>
    </>
  );
}

/* ================= dialog ================= */
export function AbsDialog({ id, tanggal, onClose }: { id: string; tanggal: string; onClose: () => void }) {
  const { d, run } = useDash();
  const r = recOf(d, tanggal, id) || {};
  const [status, setStatus] = useState<AbsStatus>(r.status || 'Hadir');
  return (
    <FormDialog wide={false} title={`Input manual · ${karName(d, id)} · ${fmtD(tanggal)}`} onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return run(absenManual(id, tanggal, { status, ket: f.ket, masuk: f.masuk, pulang: f.pulang }), 'Absensi dikoreksi');
      }}>
      <p className="hint">Untuk HP rusak, tugas luar, izin, sakit, atau libur. Tercatat sebagai input manual oleh {d.me.nama}.</p>
      <div className="grid2">
        <label className="lbl">Status<select className="field" value={status} onChange={e => setStatus(e.target.value as AbsStatus)}>{ABS_ST.map(s => <option key={s}>{s}</option>)}</select></label>
        <span />
        {status === 'Hadir' && <>
          <label className="lbl">Jam masuk<input className="field" type="time" name="masuk" defaultValue={r.masuk || ''} required /></label>
          <label className="lbl">Jam pulang<input className="field" type="time" name="pulang" defaultValue={r.pulang || ''} /></label>
        </>}
        <label className="lbl span2">Alasan (wajib)<input className="field" name="ket" required defaultValue={r.via === 'Manual' ? r.ket || '' : ''} placeholder="mis. HP rusak, tugas ambil barang di toko" autoFocus /></label>
      </div>
    </FormDialog>
  );
}

export function LiburDialog({ onClose }: { onClose: () => void }) {
  const { d, run } = useDash();
  return (
    <FormDialog wide={false} title="Tandai libur" onClose={onClose}
      onSubmit={form => { const f = formObj(form); return run(liburSemua(f.tanggal, f.ket), 'Libur ditandai'); }}>
      <p className="hint">Untuk libur dadakan / tanggal merah: semua karyawan aktif yang belum hadir ditandai Libur, jadi tidak dihitung Alpa. Libur perorangan pakai “Input manual”.</p>
      <div className="grid2">
        <label className="lbl">Tanggal<input className="field" type="date" name="tanggal" required defaultValue={d.today} /></label>
        <label className="lbl">Keterangan<input className="field" name="ket" placeholder="mis. Tanggal merah / libur bengkel" /></label>
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
        const libur = [...new FormData(form).getAll('libur')].map(Number);
        return run(saveKaryawan(k?.id || null, { nama: f.nama, peran: f.peran, hp: f.hp, nonaktif: !!f.nonaktif, liburMingguan: libur }), k ? 'Data karyawan diperbarui' : 'Karyawan ditambahkan');
      }}>
      <div className="grid2">
        <label className="lbl span2">Nama<input className="field" name="nama" required defaultValue={k?.nama || ''} autoFocus /></label>
        <label className="lbl">Jabatan<input className="field" name="peran" defaultValue={k?.peran || ''} placeholder="Teknisi / Helper / Admin" /></label>
        <label className="lbl">No. HP<input className="field" name="hp" inputMode="tel" defaultValue={k?.hp || ''} placeholder="0812…" /></label>
        <fieldset className="box span2">
          <legend>Libur rutin tiap minggu</legend>
          <div className="actions">
            {HARI.map((h, i) => (
              <label key={h} className="pill" style={{ cursor: 'pointer' }}>
                <input type="checkbox" name="libur" value={i} defaultChecked={k?.liburMingguan?.includes(i)} style={{ marginRight: 4 }} />{h}
              </label>
            ))}
          </div>
          <p className="hint">Di hari ini karyawan tidak ditandai Alpa otomatis. Contoh: admin libur setiap Minggu.</p>
        </fieldset>
        {k && (
          <label className="lbl span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="nonaktif" defaultChecked={!!k.nonaktif} /> Nonaktif (sudah tidak bekerja)
          </label>
        )}
      </div>
    </FormDialog>
  );
}

export function AkunDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const k = d.karyawan.find(x => x.id === id);
  const [armed, setArmed] = useState(false);
  if (!k) return null;
  const owner = d.me.peran === 'owner';

  if (!k.akun)
    return (
      <FormDialog wide={false} title={`Buat akun login · ${k.nama}`} submitLabel="Buat akun" onClose={onClose}
        onSubmit={form => { const f = formObj(form); return run(buatAkun(k.id, f.hp, f.password, (f.peranAkun as 'admin' | 'karyawan') || 'karyawan'), 'Akun dibuat'); }}>
        <p className="hint">Karyawan login di halaman masuk dengan <b>nomor HP</b> sebagai username dan password di bawah. Berikan password ini langsung ke karyawannya; nanti bisa diganti.</p>
        <div className="grid2">
          <label className="lbl">Nomor HP (username)<input className="field" name="hp" required inputMode="tel" defaultValue={k.hp} placeholder="081234567890" /></label>
          <label className="lbl">Password awal<input className="field" name="password" required minLength={8} placeholder="min. 8 karakter" /></label>
          {owner && (
            <label className="lbl span2">Peran
              <select className="field" name="peranAkun" defaultValue="karyawan">
                <option value="karyawan">Karyawan: hanya absen & jadwal sendiri</option>
                <option value="admin">Admin: kelola order, stok, absensi (tanpa harga modal & omzet)</option>
              </select>
            </label>
          )}
        </div>
      </FormDialog>
    );

  return (
    <FormDialog wide={false} title={`Akun login · ${k.nama}`} submitLabel="Ganti password" onClose={onClose}
      onSubmit={form => { const f = formObj(form); return run(resetPassword(k.id, f.password), 'Password diganti'); }}>
      <p>Username: <b className="mono">{k.akun.username}</b> · peran <b>{k.akun.peran === 'admin' ? 'Admin' : 'Karyawan'}</b></p>
      <label className="lbl">Password baru<input className="field" name="password" required minLength={8} placeholder="min. 8 karakter" autoFocus /></label>
      <p className="hint">Mengganti password akan mengeluarkan akun ini dari semua HP yang sedang login.</p>
      <div>
        <Button type="button" variant="destructive" onClick={async () => {
          if (!armed) return setArmed(true);
          if (await run(hapusAkun(k.id), 'Akun dihapus')) onClose();
        }}>{armed ? 'Klik lagi untuk hapus akun' : 'Hapus akun login'}</Button>
      </div>
    </FormDialog>
  );
}
