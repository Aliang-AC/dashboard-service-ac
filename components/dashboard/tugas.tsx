'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { hapusFoto, kirimFoto, teknisiLapor, teknisiStatus } from '@/app/actions';
import { STATUS_CLS } from '@/lib/derive';
import { fmtD, waNumber } from '@/lib/format';
import { JENIS_FOTO, type Foto, type Order, type Status } from '@/lib/types';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { mapsUrl } from './order';

/* Kecilkan foto di HP sebelum dikirim: sisi terpanjang 1280 px, JPEG kualitas 0.75 (±200–400 KB). */
async function kecilkan(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.75);
}

/* Galeri foto sebelum/sesudah + tombol ambil foto (dipakai teknisi & admin) */
export function FotoGaleri({ o, bisaTambah }: { o: Order; bisaTambah: boolean }) {
  const { d, run } = useDash();
  const [kirim, setKirim] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const jenisRef = useRef<Foto['jenis']>('Sebelum');
  const [now] = useState(() => Date.now()); // waktu saat galeri dibuka (server tetap memeriksa ulang)
  const bisaHapus = (f: Foto) => d.me.peran !== 'karyawan' || (f.olehUid === d.me.uid && now - f.at < 24 * 3600_000);

  const ambil = (jenis: Foto['jenis']) => { jenisRef.current = jenis; input.current?.click(); };
  const onFile = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 6)) {
      setKirim(`Mengirim foto ${jenisRef.current.toLowerCase()}…`);
      try { await run(kirimFoto(o.id, jenisRef.current, await kecilkan(f)), `Foto ${jenisRef.current.toLowerCase()} tersimpan`); }
      catch { toast.error('Foto tidak bisa dibaca. Coba ambil ulang.'); }
    }
    setKirim(null);
    if (input.current) input.current.value = '';
  };

  return (
    <fieldset className="box">
      <legend>Foto bukti kerja · {o.foto.length}</legend>
      {!d.fotoAktif && <p className="hint" style={{ color: 'var(--warn)' }}>Penyimpanan foto belum disambungkan pemilik (Pengaturan → Foto bukti kerja).</p>}
      {bisaTambah && d.fotoAktif && (
        <div className="actions">
          {JENIS_FOTO.map(j => <Button key={j} type="button" size="sm" variant={j === 'Sebelum' ? 'outline' : 'default'} disabled={!!kirim} onClick={() => ambil(j)}>📷 Foto {j.toLowerCase()}</Button>)}
          <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => onFile(e.target.files)} />
          {kirim && <span className="hint">{kirim}</span>}
        </div>
      )}
      {JENIS_FOTO.map(j => {
        const fs = o.foto.filter(f => f.jenis === j);
        if (!fs.length) return null;
        return (
          <div key={j}>
            <div className="sm" style={{ fontWeight: 600, margin: '4px 0' }}>{j}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
              {fs.map(f => (
                <div key={f.id} style={{ position: 'relative' }}>
                  <a href={`/api/foto/${f.id}`} target="_blank" rel="noopener noreferrer" title={`${f.oleh} · ${new Date(f.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/foto/${f.id}`} alt={`Foto ${j.toLowerCase()}`} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                  </a>
                  {bisaHapus(f) && (
                    <button type="button" aria-label="Hapus foto" onClick={() => run(hapusFoto(o.id, f.id), 'Foto dihapus')}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgb(0 0 0 / .55)', color: '#fff', border: 0, borderRadius: 999, width: 24, height: 24, cursor: 'pointer' }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!o.foto.length && d.fotoAktif && <p className="hint">Belum ada foto.</p>}
    </fieldset>
  );
}

type Baru = { key: number; layanan: string; unit: string; qty: string };
type PartBaru = { key: number; itemId: string; qty: string };
let k = 0;

/* Layar tugas teknisi untuk satu order */
export function TugasDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const o = d.orders.find(x => x.id === id);
  const [items, setItems] = useState<Baru[]>([]);
  const [parts, setParts] = useState<PartBaru[]>([]);
  const lay = d.settings.layanan || [];
  const stok = d.stok.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  if (!o) return null;
  const units = [...new Set(o.items.map(i => i.unit).filter(Boolean))];

  return (
    <FormDialog title={`Tugas · ${o.pelanggan}`} submitLabel="Kirim laporan" onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        if (!items.length && !parts.length && !f.catatan?.trim()) return Promise.resolve(true);
        return run(teknisiLapor(o.id, {
          items: items.map(i => ({ layanan: i.layanan, unit: i.unit, qty: +i.qty || 1 })),
          parts: parts.filter(p => p.itemId).map(p => ({ itemId: p.itemId, qty: +p.qty || 0 })),
          catatan: f.catatan || '',
        }), 'Laporan terkirim');
      }}>
      <div>
        <div className="sm">{fmtD(o.tanggal)} {o.jam} · <span className="mono">{o.invoice}</span></div>
        <div style={{ margin: '4px 0' }}>{o.alamat}</div>
        <div className="actions">
          {o.alamat && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={mapsUrl(o.alamat)} target="_blank" rel="noopener noreferrer" />}>📍 Google Maps</Button>}
          {o.hp && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={`tel:${o.hp}`} />}>📞 Telepon</Button>}
          {waNumber(o.hp) && <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={`https://wa.me/${waNumber(o.hp)}`} target="_blank" rel="noopener noreferrer" />}>WhatsApp</Button>}
        </div>
      </div>

      <fieldset className="box">
        <legend>Pekerjaan</legend>
        <ul className="list">{o.items.map((i, n) => <li key={n}><div className="main">{i.layanan}{i.qty > 1 ? ` ×${i.qty}` : ''}<div className="meta">{i.unit}</div></div></li>)}</ul>
        {o.ket && <p className="hint">Catatan admin: {o.ket}</p>}
      </fieldset>

      <fieldset className="box">
        <legend>Status pekerjaan</legend>
        <div className="actions">
          <span className={`pill ${STATUS_CLS[o.status] || ''}`}>Sekarang: {o.status}</span>
          {(['Dikerjakan', 'Selesai', 'Jadwal ulang'] as Status[]).filter(s => s !== o.status).map(s => (
            <Button key={s} type="button" size="sm" variant={s === 'Selesai' ? 'default' : 'outline'} disabled={o.status === 'Batal'}
              onClick={() => run(teknisiStatus(o.id, s), 'Status: ' + s)}>{s === 'Dikerjakan' ? 'Mulai kerjakan' : s === 'Selesai' ? '✓ Tandai selesai' : 'Jadwal ulang'}</Button>
          ))}
        </div>
      </fieldset>

      <FotoGaleri o={o} bisaTambah={o.status !== 'Batal'} />

      <fieldset className="box">
        <legend>Tambah pekerjaan di lokasi</legend>
        <datalist id="unitTugas">{units.map(u => <option key={u} value={u} />)}</datalist>
        {items.map(i => (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1.3fr) 56px 34px', gap: 6 }}>
            <select className="field" value={i.layanan} onChange={e => setItems(xs => xs.map(x => (x.key === i.key ? { ...x, layanan: e.target.value } : x)))}>
              {lay.map(l => <option key={l.nama}>{l.nama}</option>)}
            </select>
            <input className="field" list="unitTugas" placeholder="Unit / lokasi" value={i.unit} onChange={e => setItems(xs => xs.map(x => (x.key === i.key ? { ...x, unit: e.target.value } : x)))} />
            <input className="field" type="number" min={1} value={i.qty} onChange={e => setItems(xs => xs.map(x => (x.key === i.key ? { ...x, qty: e.target.value } : x)))} />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus" onClick={() => setItems(xs => xs.filter(x => x.key !== i.key))}>×</Button>
          </div>
        ))}
        <div><Button type="button" size="sm" variant="outline" disabled={!lay.length} onClick={() => setItems(xs => [...xs, { key: ++k, layanan: lay[0]?.nama || '', unit: '', qty: '1' }])}>+ Pekerjaan tambahan</Button></div>
      </fieldset>

      <fieldset className="box">
        <legend>Sparepart / bahan dipakai</legend>
        {o.parts.length > 0 && <ul className="list">{o.parts.map(p => <li key={p.itemId}><div className="main">{p.nama}</div><span className="num">{p.qty} {p.satuan}</span></li>)}</ul>}
        {parts.map(p => (
          <div key={p.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 70px 34px', gap: 6 }}>
            <select className="field" value={p.itemId} onChange={e => setParts(xs => xs.map(x => (x.key === p.key ? { ...x, itemId: e.target.value } : x)))}>
              <option value="">Pilih barang…</option>
              {stok.map(s => <option key={s.id} value={s.id}>{s.nama} (sisa {+s.qty || 0} {s.satuan})</option>)}
            </select>
            <input className="field" type="number" min={0} step="any" value={p.qty} onChange={e => setParts(xs => xs.map(x => (x.key === p.key ? { ...x, qty: e.target.value } : x)))} />
            <Button type="button" variant="outline" size="icon" aria-label="Hapus" onClick={() => setParts(xs => xs.filter(x => x.key !== p.key))}>×</Button>
          </div>
        ))}
        <div><Button type="button" size="sm" variant="outline" disabled={!stok.length} onClick={() => setParts(xs => [...xs, { key: ++k, itemId: '', qty: '1' }])}>+ Sparepart dipakai</Button></div>
      </fieldset>

      {o.catatanTeknisi && <fieldset className="box"><legend>Catatan sebelumnya</legend><p style={{ margin: 0, whiteSpace: 'pre-wrap' }} className="sm">{o.catatanTeknisi}</p></fieldset>}
      <label className="lbl">Catatan teknisi<textarea className="field" name="catatan" placeholder="mis. kapasitor outdoor lemah, sarankan ganti" /></label>
      <p className="hint">Status & foto langsung tersimpan. Pekerjaan tambahan, sparepart, dan catatan terkirim saat klik “Kirim laporan”.</p>
    </FormDialog>
  );
}
