'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { daftarKonsumen } from '@/app/daftar/actions';
import { Button } from '@/components/ui/button';
import { NAMA_USAHA, WA_USAHA } from '@/lib/brand';
import { PERKIRAAN_TERAKHIR } from '@/lib/servis';
import { TIPE_AC, TIPE_LOKASI } from '@/lib/types';

type U = { key: number; label: string; merk: string; pk: string; tipe: string; terakhir: string };
let k = 0;
const unitKosong = (): U => ({ key: ++k, label: '', merk: '', pk: '', tipe: 'Split', terakhir: '1-3' });

export function FormDaftar() {
  const [units, setUnits] = useState<U[]>([unitKosong()]);
  const [maps, setMaps] = useState('');
  const [busy, setBusy] = useState(false);
  const [selesai, setSelesai] = useState<{ nama: string; mau: boolean } | null>(null);
  const setU = (key: number, p: Partial<U>) => setUnits(us => us.map(u => (u.key === key ? { ...u, ...p } : u)));

  const lokasi = () => {
    if (!('geolocation' in navigator)) return toast.error('HP ini tidak mendukung lokasi.');
    toast.info('Membaca lokasi…');
    navigator.geolocation.getCurrentPosition(
      p => { setMaps(`https://www.google.com/maps?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`); toast.success('Lokasi tersimpan.'); },
      () => toast.error('Lokasi tidak terbaca. Izinkan akses lokasi, atau lewati saja.'),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  if (selesai)
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 24, background: 'var(--good-soft)' }}>
        <div style={{ fontSize: 44 }} aria-hidden>✓</div>
        <h3 className="justify-center" style={{ color: 'var(--good)' }}>Terima kasih, {selesai.nama}!</h3>
        <p>Data Anda sudah tersimpan. {selesai.mau ? 'Admin kami akan segera menghubungi untuk menjadwalkan servis.' : 'Kami akan mengingatkan saat AC Anda sudah waktunya dibersihkan.'}</p>
        <Button nativeButton={false} render={<a href={`https://wa.me/${WA_USAHA}?text=${encodeURIComponent(`Halo ${NAMA_USAHA}, saya ${selesai.nama} baru saja mendaftar lewat form online.`)}`} target="_blank" rel="noopener noreferrer" />}>Chat WhatsApp kami</Button>
      </div>
    );

  return (
    <form className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18 }}
      onSubmit={async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        setBusy(true);
        const r = await daftarKonsumen({
          nama: f.nama, hp: f.hp, alamat: f.alamat, patokan: f.patokan, maps, tipeLokasi: f.tipeLokasi,
          units: units.map(({ key, ...u }) => (void key, u)), mauServis: !!f.mauServis, izin: !!f.izin, catatan: f.catatan, website: f.website,
        }).catch(() => null);
        setBusy(false);
        if (!r || !r.ok) return toast.error(r && !r.ok ? r.error : 'Koneksi terputus. Coba lagi.');
        setSelesai({ nama: f.nama, mau: !!f.mauServis });
        window.scrollTo(0, 0);
      }}>
      {/* kolom jebakan bot: tidak terlihat oleh manusia */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />
      <label className="lbl">Nama lengkap / nama kantor<input className="field" name="nama" required autoComplete="name" /></label>
      <label className="lbl">Nomor WhatsApp<input className="field" name="hp" required inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" /></label>
      <label className="lbl">Jenis lokasi
        <select className="field" name="tipeLokasi" defaultValue="Rumah">{TIPE_LOKASI.map(t => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="lbl">Alamat lengkap<textarea className="field" name="alamat" required placeholder="Jalan, nomor rumah, RT/RW, kelurahan" /></label>
      <label className="lbl">Patokan (opsional)<input className="field" name="patokan" placeholder="mis. depan masjid, pagar hijau" /></label>
      <div className="actions">
        <Button type="button" variant="outline" onClick={lokasi}>📍 Bagikan lokasi saya</Button>
        {maps && <span className="sm">Lokasi tersimpan ✓</span>}
      </div>

      <fieldset className="box">
        <legend>Unit AC Anda</legend>
        {units.map((u, n) => (
          <div key={u.key} className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <b className="sm">AC ke-{n + 1}</b>
              {units.length > 1 && <Button type="button" size="xs" variant="ghost" onClick={() => setUnits(us => us.filter(x => x.key !== u.key))}>Hapus</Button>}
            </div>
            <input className="field" required placeholder="Di ruangan mana? (mis. Kamar tidur)" value={u.label} onChange={e => setU(u.key, { label: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,.8fr) minmax(0,1fr)', gap: 6 }}>
              <input className="field" placeholder="Merk (jika tahu)" value={u.merk} onChange={e => setU(u.key, { merk: e.target.value })} />
              <input className="field" placeholder="PK" value={u.pk} onChange={e => setU(u.key, { pk: e.target.value })} />
              <select className="field" value={u.tipe} onChange={e => setU(u.key, { tipe: e.target.value })}>{TIPE_AC.map(t => <option key={t}>{t}</option>)}</select>
            </div>
            <label className="lbl">Kira-kira kapan terakhir dicuci?
              <select className="field" value={u.terakhir} onChange={e => setU(u.key, { terakhir: e.target.value })}>
                {Object.entries(PERKIRAAN_TERAKHIR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        ))}
        <div><Button type="button" size="sm" variant="outline" onClick={() => setUnits(us => [...us, unitKosong()])}>+ Tambah AC lain</Button></div>
      </fieldset>

      <label className="lbl">Catatan / keluhan (opsional)<textarea className="field" name="catatan" placeholder="mis. AC kamar kurang dingin, ada bunyi" /></label>
      <label className="lbl" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 500 }}>
        <input type="checkbox" name="mauServis" style={{ marginTop: 4 }} /> Saya mau langsung dijadwalkan servis
      </label>
      <label className="lbl" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 500 }}>
        <input type="checkbox" name="izin" defaultChecked style={{ marginTop: 4 }} /> Saya bersedia menerima pengingat cuci AC lewat WhatsApp dari {NAMA_USAHA}
      </label>
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pendaftaran'}</Button>
      <p className="hint" style={{ textAlign: 'center' }}>Data Anda hanya dipakai {NAMA_USAHA} untuk layanan servis AC.</p>
    </form>
  );
}
