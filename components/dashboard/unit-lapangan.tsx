'use client';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cekStiker, fotoNameplate, pasangStiker, simpanUnitLapangan, type InfoStiker } from '@/app/actions';
import { FREON, TIPE_AC, type Pelanggan, type UnitAC } from '@/lib/types';
import { gedungMirip, kodeDariTeks, lokasiUnit, POLA_KODE, specUnit } from '@/lib/unit';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { kecilkan } from './tugas';

export const MERK_AC = ['Daikin', 'Panasonic', 'Sharp', 'LG', 'Samsung', 'Gree', 'Midea', 'Polytron', 'Aux', 'Mitsubishi', 'Toshiba', 'Changhong', 'Hisense', 'TCL'];
export const RUANGAN_CEPAT = ['Kamar utama', 'Kamar anak', 'Kamar tamu', 'Ruang tamu', 'Ruang keluarga', 'Ruang kerja', 'Dapur', 'Toko', 'Kantor'];

/* Kamera HP untuk membaca QR stiker (jsQR), dengan isian ketik kode sebagai cadangan. */
export function ScanStiker({ onKode, onBatal }: { onKode: (kode: string) => void; onBatal: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [galat, setGalat] = useState('');
  const [ketik, setKetik] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, hidup = true;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const loop = () => {
      const v = video.current;
      if (!hidup || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const k = Math.min(1, 640 / v.videoWidth);
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const hasil = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
        const kode = hasil ? kodeDariTeks(hasil.data) : '';
        if (kode) { hidup = false; navigator.vibrate?.(80); onKode(kode); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } raf = requestAnimationFrame(loop); })
      .catch(() => setGalat('Kamera tidak bisa dibuka. Izinkan akses kamera, atau ketik nomor stiker di bawah.'));
    return () => { hidup = false; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onKode]);

  return (
    <div className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {galat ? <p className="hint" style={{ color: 'var(--warn)', margin: 0 }}>{galat}</p> : (
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden style={{ position: 'absolute', inset: '18%', border: '3px solid rgb(255 255 255 / .85)', borderRadius: 12 }} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', color: '#fff', fontSize: '.8rem', textShadow: '0 1px 3px #000' }}>Arahkan kamera ke QR stiker</span>
        </div>
      )}
      <div className="actions" style={{ alignItems: 'center' }}>
        <input className="field mono" value={ketik} onChange={e => setKetik(e.target.value.toUpperCase())} placeholder="atau ketik: GT-0015" style={{ flex: 1, minWidth: 140 }} inputMode="text" />
        <Button type="button" size="sm" disabled={!POLA_KODE.test(kodeDariTeks(ketik))} onClick={() => onKode(kodeDariTeks(ketik))}>Pakai</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onBatal}>Batal</Button>
      </div>
    </div>
  );
}

/* Hasil cek stiker: siap dipasang / sudah terpakai (tampilkan milik siapa) / tidak berlaku */
export function StatusStikerBox({ info, unitId, pelangganId }: { info: InfoStiker; unitId?: string; pelangganId: string }) {
  if (info.status === 'kosong') return <p className="banner" style={{ margin: 0, background: 'var(--good-soft)', color: 'var(--good)' }}>✓ Stiker <b className="mono">{info.kode}</b> masih baru, siap dipasang.</p>;
  if (info.status === 'aktif' && info.pelangganId === pelangganId && info.unitId === unitId) return <p className="banner" style={{ margin: 0 }}>Stiker <b className="mono">{info.kode}</b> memang sudah terpasang di unit ini.</p>;
  if (info.status === 'aktif')
    return (
      <div className="banner" style={{ margin: 0, background: 'var(--bad-soft)', color: 'var(--bad)' }}>
        ⚠️ <b>Stiker {info.kode} sudah terdaftar</b>
        <div style={{ color: 'var(--ink)', marginTop: 4, fontSize: '.9rem' }}>Pelanggan: <b>{info.pelanggan}</b>{info.alamat ? ` · ${info.alamat}` : ''}<br />Unit: {[info.lokasi, info.spec].filter(Boolean).join(' · ') || '—'}</div>
        <div className="sm" style={{ marginTop: 4 }}>Pakai stiker lain, atau minta admin mengecek kalau ini unit yang sama.</div>
      </div>
    );
  if (info.status === 'diganti') return <p className="banner" style={{ margin: 0, background: 'var(--bad-soft)', color: 'var(--bad)' }}>Stiker <b className="mono">{info.kode}</b> sudah tidak berlaku (pernah diganti). Pakai stiker lain.</p>;
  return <p className="banner" style={{ margin: 0, background: 'var(--bad-soft)', color: 'var(--bad)' }}>Nomor <b className="mono">{info.kode}</b> tidak terdaftar. Cek lagi nomor di stiker.</p>;
}
export const stikerBisaDipakai = (info: InfoStiker | null, pelangganId: string, unitId?: string) =>
  !!info && (info.status === 'kosong' || (info.status === 'aktif' && info.pelangganId === pelangganId && info.unitId === unitId));

/* Pilih gedung dari daftar konsumen, atau tulis gedung baru (dengan peringatan kalau mirip yang sudah ada) */
export function PilihGedung({ daftar, value, onChange }: { daftar: string[]; value: string; onChange: (g: string) => void }) {
  const [baru, setBaru] = useState(!!value && !daftar.includes(value));
  const mirip = baru ? gedungMirip(value, daftar) : '';
  return (
    <label className="lbl">Gedung / area <span className="sm">(opsional, untuk kantor / instansi)</span>
      {!baru ? (
        <select className="field" value={value} onChange={e => { if (e.target.value === '__baru') { setBaru(true); onChange(''); } else onChange(e.target.value); }}>
          <option value="">— Tanpa gedung —</option>
          {daftar.map(g => <option key={g}>{g}</option>)}
          <option value="__baru">+ Gedung baru…</option>
        </select>
      ) : (
        <span style={{ display: 'flex', gap: 6 }}>
          <input className="field" value={value} onChange={e => onChange(e.target.value)} placeholder="mis. Gedung Laboratorium" style={{ flex: 1 }} autoFocus />
          {daftar.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => { setBaru(false); onChange(''); }}>Pilih dari daftar</Button>}
        </span>
      )}
      {mirip && (
        <span className="hint" style={{ color: 'var(--warn)' }}>
          Mirip dengan <b>“{mirip}”</b> yang sudah ada.{' '}
          <button type="button" className="linkbtn" onClick={() => { setBaru(false); onChange(mirip); }}>Pakai “{mirip}”</button>
        </span>
      )}
    </label>
  );
}

/* Foto name plate indoor / outdoor */
export function FotoNameplate({ u, pelangganId, orderId }: { u: UnitAC; pelangganId: string; orderId?: string }) {
  const { d, run } = useDash();
  const input = useRef<HTMLInputElement>(null);
  const sisiRef = useRef<'indoor' | 'outdoor'>('indoor');
  const [kirim, setKirim] = useState('');
  const onFile = async (f?: File) => {
    if (!f) return;
    setKirim(`Mengirim foto ${sisiRef.current}…`);
    try { await run(fotoNameplate({ orderId, pelangganId, unitId: u.id, sisi: sisiRef.current, base64: await kecilkan(f) }), `Foto name plate ${sisiRef.current} tersimpan`); }
    catch { toast.error('Foto tidak bisa dibaca. Coba ambil ulang.'); }
    setKirim('');
    if (input.current) input.current.value = '';
  };
  return (
    <fieldset className="box">
      <legend>Foto name plate (opsional)</legend>
      {!d.fotoAktif ? <p className="hint" style={{ color: 'var(--warn)', margin: 0 }}>Penyimpanan foto belum disambungkan pemilik (Pengaturan → Foto bukti kerja).</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['indoor', 'outdoor'] as const).map(s => {
              const id = s === 'indoor' ? u.fotoIndoor : u.fotoOutdoor;
              return (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="sm" style={{ fontWeight: 600 }}>{s === 'indoor' ? 'Indoor' : 'Outdoor'}</span>
                  {id ? (
                    <a href={`/api/foto/${id}`} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/foto/${id}`} alt={`Name plate ${s}`} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                    </a>
                  ) : <div className="empty" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', padding: 4 }}>Belum ada</div>}
                  <Button type="button" size="sm" variant="outline" disabled={!!kirim} onClick={() => { sisiRef.current = s; input.current?.click(); }}>📷 {id ? 'Ganti foto' : 'Foto'} {s}</Button>
                </div>
              );
            })}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => onFile(e.target.files?.[0])} />
          {kirim && <span className="hint">{kirim}</span>}
        </>
      )}
    </fieldset>
  );
}

/* Teknisi: catat unit AC baru / ubah unit / pasang stiker, dari tugas order. Kembali ke tugas saat ditutup. */
/* onClose tidak dipakai: menutup jendela ini kembali ke tugas order */
export function UnitLapanganDialog({ orderId, unitId }: { orderId: string; unitId?: string; onClose: () => void }) {
  const { d, run, open } = useDash();
  const o = d.orders.find(x => x.id === orderId);
  const p: Pelanggan | undefined = d.pelanggan.find(x => x.id === o?.pelangganId);
  const u = p?.units?.find(x => x.id === unitId);
  const [gedung, setGedung] = useState(u?.gedung || '');
  const [scan, setScan] = useState(false);
  const [info, setInfo] = useState<InfoStiker | null>(null);
  const [ganti, setGanti] = useState(false);
  const kembali = () => open({ kind: 'tugas', id: orderId });
  if (!o) return null;
  if (!p) return (
    <FormDialog wide={false} title="Catat unit AC" onClose={kembali} submitLabel="Kembali">
      <p className="hint">Order ini belum terhubung ke data konsumen. Minta admin membuka & menyimpan ulang order ini.</p>
    </FormDialog>
  );

  const cek = async (kode: string) => {
    setScan(false);
    const r = await cekStiker(kode);
    if (!r.ok) return toast.error(r.error);
    setInfo(r.data);
  };
  const bisa = stikerBisaDipakai(info, p.id, u?.id);

  return (
    <FormDialog title={u ? `Unit AC · ${lokasiUnit(u) || 'tanpa nama'}` : `Catat unit AC · ${p.nama}`} submitLabel={u ? 'Simpan unit' : 'Simpan & lanjut foto'} onClose={kembali}
      onSubmit={async form => {
        const f = formObj(form);
        if (info && !bisa) { toast.error('Stiker yang dipilih tidak bisa dipakai. Pakai stiker lain atau hapus pilihan stiker.'); return false; }
        const r = await simpanUnitLapangan({
          orderId, unitId: u?.id, gantiUnit: ganti, kode: bisa ? info!.kode : '',
          gedung, label: f.label, noAc: f.noAc, merk: f.merk, pk: f.pk, tipe: f.tipe, freon: f.freon, catatan: f.catatan,
        });
        const ok = await run(Promise.resolve(r.ok ? { ok: true as const } : r), u ? 'Unit diperbarui' : 'Unit tersimpan. Tambahkan foto name plate bila perlu.');
        if (ok && r.ok && !u) { open({ kind: 'unit', orderId, unitId: r.data.unitId }); return false; }
        if (ok) kembali();
        return false;
      }}>
      <p className="hint" style={{ margin: 0 }}>{p.nama}{p.alamat ? ` · ${p.alamat}` : ''}</p>

      <fieldset className="box">
        <legend>Stiker QR</legend>
        {u?.kode && !info && <p style={{ margin: 0 }}>Terpasang: <b className="mono">{u.kode}</b></p>}
        {info && <StatusStikerBox info={info} unitId={u?.id} pelangganId={p.id} />}
        {scan ? <ScanStiker onKode={cek} onBatal={() => setScan(false)} /> : (
          <div className="actions">
            <Button type="button" size="sm" variant={u?.kode ? 'outline' : 'default'} onClick={() => { setInfo(null); setScan(true); }}>📷 {u?.kode ? 'Ganti stiker (rusak / hilang)' : 'Scan stiker'}</Button>
            {info && <Button type="button" size="sm" variant="ghost" onClick={() => setInfo(null)}>Batalkan stiker ini</Button>}
          </div>
        )}
        {u?.kode && bisa && info?.kode !== u.kode && <p className="hint" style={{ margin: 0 }}>Stiker lama <b className="mono">{u.kode}</b> otomatis ditandai “sudah diganti”.</p>}
        {u && bisa && info?.kode !== u.kode && (
          <div><Button type="button" size="sm" onClick={() => run(pasangStiker({ pelangganId: p.id, unitId: u.id, kode: info!.kode, orderId }), `Stiker ${info!.kode} terpasang`).then(ok => ok && setInfo(null))}>Pasang stiker sekarang</Button></div>
        )}
      </fieldset>

      <div className="grid2">
        <div className="span2"><PilihGedung daftar={p.gedung || []} value={gedung} onChange={setGedung} /></div>
        <label className="lbl">Ruangan<input className="field" name="label" required defaultValue={u?.label || ''} list="ruanganCepat" placeholder="mis. Ruang Immunologi" /></label>
        <label className="lbl">No. AC / no. aset <span className="sm">(opsional)</span><input className="field" name="noAc" defaultValue={u?.noAc || ''} placeholder="mis. 105" /></label>
        {u && (
          <label className="span2" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={ganti} onChange={e => setGanti(e.target.checked)} style={{ marginTop: 4 }} />
            <span>AC di titik ini <b>diganti unit baru</b> — data AC lama ({specUnit(u) || 'tanpa data'}) disimpan ke riwayat. Isi data AC baru di bawah.</span>
          </label>
        )}
        <label className="lbl">Merk<input className="field" name="merk" key={'m' + ganti} defaultValue={ganti ? '' : u?.merk || ''} list="merkAc" /></label>
        <label className="lbl">PK<input className="field" name="pk" key={'p' + ganti} defaultValue={ganti ? '' : u?.pk || ''} placeholder="mis. 1" inputMode="decimal" /></label>
        <label className="lbl">Tipe AC<select className="field" name="tipe" key={'t' + ganti} defaultValue={ganti ? 'Split' : u?.tipe || 'Split'}>{TIPE_AC.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="lbl">Jenis freon<input className="field" name="freon" key={'f' + ganti} defaultValue={ganti ? '' : u?.freon || ''} list="freonAc" placeholder="R32 / R410A / R22" /></label>
        <label className="lbl span2">Catatan <span className="sm">(opsional)</span><textarea className="field" name="catatan" defaultValue={u?.catatan || ''} placeholder="mis. indoor Daikin 1 PK, outdoor Panasonic; bracket outdoor berkarat" /></label>
      </div>
      <datalist id="ruanganCepat">{RUANGAN_CEPAT.map(r => <option key={r} value={r} />)}</datalist>
      <datalist id="merkAc">{MERK_AC.map(m => <option key={m} value={m} />)}</datalist>
      <datalist id="freonAc">{FREON.map(m => <option key={m} value={m} />)}</datalist>

      {u && <FotoNameplate u={u} pelangganId={p.id} orderId={orderId} />}
      {!u && <p className="hint" style={{ margin: 0 }}>Foto name plate bisa ditambahkan setelah unit disimpan.</p>}
    </FormDialog>
  );
}
