'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cekStiker, dataPendataan, fotoNameplate, simpanUnitPendataan, type DataPendataan, type UnitPendataan } from '@/app/actions';
import { MERK_AC, ScanStiker } from '@/components/dashboard/unit-lapangan';
import { kecilkan } from '@/components/dashboard/tugas';
import { TIPE_AC } from '@/lib/types';
import { gedungMirip, seriKode, specUnit } from '@/lib/unit';

const PK = [['0,5', '½'], ['0,75', '¾'], ['1', '1'], ['1,5', '1½'], ['2', '2'], ['2,5', '2½'], ['3', '3'], ['5', '5']] as const;
const TANPA_PLAT = 'Name plate tidak ada';

type Isian = { kode: string; unitId?: string; gedung: string; label: string; noAc: string; tanpaAset: boolean; merk: string; pk: string; tipe: string; catatan: string; tanpaPlat: boolean };
type FotoBaru = { indoor?: string; outdoor?: string };

/* Mode pendataan AC instansi: scan stiker khusus (mis. RSUD-0001) → isi gedung, ruangan, no. aset, merk, PK, foto name plate → simpan. */
export function Pendataan() {
  const sp = useSearchParams();
  const data = useSWR('pendataan', async () => { const r = await dataPendataan(); if (!r.ok) throw new Error(r.error); return r.data; });
  const inst = data.data?.find(x => x.id === sp.get('p')) || (data.data?.length === 1 ? data.data[0] : undefined);
  const [layar, setLayar] = useState<'beranda' | 'scan' | 'isi'>('beranda');
  const [isi, setIsi] = useState<Isian | null>(null);
  const gedungTerakhir = useRef('');

  if (data.error) return <Kerangka><div className="panel empty">Gagal memuat: {String(data.error.message || data.error)}</div></Kerangka>;
  if (!data.data) return <Kerangka><div className="empty">Memuat data…</div></Kerangka>;
  if (!inst) return (
    <Kerangka>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Pilih instansi</h3>
        {data.data.length ? data.data.map(x => <Button key={x.id} variant="outline" nativeButton={false} render={<a href={`/pendataan?p=${x.id}`} />}>{x.nama}</Button>)
          : <p className="hint" style={{ margin: 0 }}>Belum ada instansi dengan mode pendataan aktif. Pemilik/admin mengaktifkannya di data konsumen → “Stiker QR khusus instansi”.</p>}
      </div>
    </Kerangka>
  );

  const bukaUnit = (u: UnitPendataan) => {
    const plat = (u.catatan || '').includes(TANPA_PLAT);
    setIsi({ kode: u.kode || '', unitId: u.id, gedung: u.gedung || '', label: u.label, noAc: u.noAc || '', tanpaAset: false, merk: u.merk || '', pk: u.pk || '', tipe: u.tipe || 'Split',
      catatan: (u.catatan || '').replace(TANPA_PLAT, '').replace(/^[\s.·]+|[\s.·]+$/g, ''), tanpaPlat: plat });
    setLayar('isi');
  };
  const onKode = async (kode: string) => {
    const r = await cekStiker(kode);
    if (!r.ok) { toast.error(r.error); return; }
    const i = r.data;
    if (i.status === 'aktif' && i.pelangganId === inst.id) {
      const u = inst.units.find(x => x.id === i.unitId);
      if (u) { toast(`Stiker ${i.kode} sudah terdata — silakan perbaiki datanya kalau perlu.`); return bukaUnit(u); }
    }
    if (i.status === 'kosong' && i.untuk === inst.id) {
      setIsi({ kode: i.kode, gedung: gedungTerakhir.current, label: '', noAc: '', tanpaAset: false, merk: '', pk: '', tipe: 'Split', catatan: '', tanpaPlat: false });
      return setLayar('isi');
    }
    setLayar('beranda');
    if (i.status === 'tidak ada') return toast.error(`Nomor ${i.kode} tidak terdaftar. Cek lagi nomor di stiker.`);
    if (i.status === 'diganti') return toast.error(`Stiker ${i.kode} sudah tidak berlaku (pernah diganti).`);
    if (i.status === 'aktif') return toast.error(`Stiker ${i.kode} sudah terpasang di ${i.pelanggan || 'konsumen lain'}${i.lokasi ? ' · ' + i.lokasi : ''}.`);
    toast.error(i.untuk ? `Stiker ${i.kode} khusus instansi lain.` : `Stiker ${i.kode} adalah stiker umum. Pakai stiker ${inst.seri}-xxxx untuk ${inst.nama}.`);
  };

  return (
    <Kerangka>
      {layar === 'scan' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Kepala judul={`Scan stiker ${inst.seri}`} sub="Arahkan kamera ke QR stiker yang baru ditempel" />
          <ScanStiker onKode={onKode} onBatal={() => setLayar('beranda')} />
        </div>
      ) : layar === 'isi' && isi ? (
        <FormUnit key={isi.kode + (isi.unitId || '')} inst={inst} awal={isi}
          onBatal={() => setLayar('beranda')}
          onSelesai={async lanjut => { await data.mutate(); setLayar(lanjut ? 'scan' : 'beranda'); }}
          onGedung={g => { gedungTerakhir.current = g; }} />
      ) : <Beranda inst={inst} onScan={() => setLayar('scan')} onBuka={bukaUnit} />}
    </Kerangka>
  );
}

function Kerangka({ children }: { children: React.ReactNode }) {
  return <main className="wrap" style={{ maxWidth: 520, paddingTop: 14, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</main>;
}
function Kepala({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <div className="panel" style={{ background: 'linear-gradient(135deg, #123a9c, #1d4fc4)', color: '#fff', border: 0 }}>
      <b style={{ fontSize: '1.08rem' }}>{judul}</b>
      {sub && <div style={{ opacity: .88, fontSize: '.82rem', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Beranda({ inst, onScan, onBuka }: { inst: DataPendataan; onScan: () => void; onBuka: (u: UnitPendataan) => void }) {
  const [q, setQ] = useState('');
  const berstiker = inst.units.filter(u => u.kode && seriKode(u.kode) === inst.seri).length;
  const total = berstiker + inst.kosong;
  const perGedung = [...inst.gedung, ''].map(g => ({ g, n: inst.units.filter(u => (u.gedung || '') === g).length })).filter(x => x.n);
  const qq = q.trim().toLowerCase();
  const daftar = qq
    ? inst.units.filter(u => [u.kode, u.gedung, u.label, u.noAc, u.merk].join(' ').toLowerCase().includes(qq)).slice(0, 30)
    : [...inst.units].filter(u => u.at).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
  return (
    <>
      <Kepala judul={`Pendataan AC · ${inst.nama}`} sub={`Stiker ${inst.seri}-xxxx · ${inst.kosong} stiker belum terpasang`} />
      <div className="panel">
        <b>{berstiker} AC sudah berstiker {inst.seri}</b>{total > 0 && <span className="sm"> dari {total} stiker dicetak</span>}
        <div style={{ height: 8, borderRadius: 99, background: 'var(--line)', overflow: 'hidden', margin: '8px 0 4px' }}>
          <div style={{ height: '100%', width: `${total ? Math.round((berstiker / total) * 100) : 0}%`, background: 'linear-gradient(90deg, #1d4fc4, #4f86ff)' }} />
        </div>
        <div className="sm">Total unit AC di data: {inst.units.length} · {inst.gedung.length} gedung</div>
      </div>
      <Button size="lg" onClick={onScan} style={{ fontWeight: 800 }}>📷 Scan stiker berikutnya</Button>
      {perGedung.length > 0 && (
        <div className="panel">
          <b style={{ fontSize: '.9rem' }}>Per gedung (urutan pendataan)</b>
          <ul className="list" style={{ marginTop: 6 }}>
            {perGedung.map((x, i) => <li key={x.g || '_'}><div className="main">{x.g ? `${i + 1}. ${x.g}` : 'Tanpa gedung'}</div><span className="sm">{x.n} AC</span></li>)}
          </ul>
        </div>
      )}
      <div className="panel">
        <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kode / gedung / ruangan / merk…" />
        <b style={{ fontSize: '.9rem', display: 'block', marginTop: 10 }}>{qq ? `Hasil cari (${daftar.length})` : 'Terakhir didata'}</b>
        {daftar.length ? (
          <ul className="list" style={{ marginTop: 6 }}>
            {daftar.map(u => (
              <li key={u.id} onClick={() => onBuka(u)} style={{ cursor: 'pointer' }}>
                <div className="main"><span className="mono">{u.kode || '—'}</span><div className="meta">{[u.gedung, u.label, specUnit(u)].filter(Boolean).join(' · ')}</div></div>
                <span className="sm">{u.at ? new Date(u.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''} ✏️</span>
              </li>
            ))}
          </ul>
        ) : <div className="empty">{qq ? 'Tidak ada yang cocok.' : 'Belum ada AC yang didata.'}</div>}
      </div>
      <Link href="/" className="sm" style={{ textAlign: 'center' }}>← Kembali ke dashboard</Link>
    </>
  );
}

function Chips({ opsi, value, onPilih }: { opsi: readonly (readonly [string, string])[]; value: string; onPilih: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {opsi.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onPilih(v)} aria-pressed={value === v}
          style={{ border: '1px solid ' + (value === v ? '#1d4fc4' : 'var(--line)'), background: value === v ? '#1d4fc4' : 'var(--card, #fff)', color: value === v ? '#fff' : 'inherit',
            fontWeight: value === v ? 700 : 500, borderRadius: 99, padding: '6px 12px', fontSize: '.85rem' }}>{l}</button>
      ))}
    </div>
  );
}

function FormUnit({ inst, awal, onBatal, onSelesai, onGedung }: { inst: DataPendataan; awal: Isian; onBatal: () => void; onSelesai: (lanjut: boolean) => Promise<void>; onGedung: (g: string) => void }) {
  const [v, setV] = useState<Isian>(awal);
  const [foto, setFoto] = useState<FotoBaru>({});
  const [busy, setBusy] = useState('');
  const [merkKetik, setMerkKetik] = useState(false);
  const set =(p: Partial<Isian>) => setV(x => ({ ...x, ...p }));
  const input = useRef<HTMLInputElement>(null);
  const sisiRef = useRef<'indoor' | 'outdoor'>('indoor');
  const unitLama = inst.units.find(u => u.id === v.unitId);
  const diDaftar = inst.gedung.find(g => g.toLowerCase() === v.gedung.trim().toLowerCase());
  const mirip = v.gedung && !diDaftar ? gedungMirip(v.gedung, inst.gedung) : '';
  const ruangan = [...new Set(inst.units.filter(u => u.gedung === (diDaftar || v.gedung) && u.label).map(u => u.label))].slice(-6);
  const merkLain = v.merk && !MERK_AC.includes(v.merk);
  const pkLain = v.pk && !PK.some(([x]) => x === v.pk);

  const ambilFoto = async (f?: File) => {
    if (!f) return;
    try { const b = await kecilkan(f); setFoto(x => ({ ...x, [sisiRef.current]: b })); set({ tanpaPlat: false }); }
    catch { toast.error('Foto tidak bisa dibaca. Coba ambil ulang.'); }
    if (input.current) input.current.value = '';
  };

  const simpan = async (lanjut: boolean) => {
    const gedung = (diDaftar || v.gedung).trim();
    if (!gedung) return toast.error('Pilih atau ketik nama gedung.');
    if (!v.label.trim()) return toast.error('Isi nama ruangan / kamar.');
    if (!v.merk.trim() || !v.pk.trim()) return toast.error('Pilih merk dan PK AC.');
    setBusy('Menyimpan…');
    const catatan = [v.tanpaPlat && TANPA_PLAT, v.catatan.trim()].filter(Boolean).join(' · ');
    const r = await simpanUnitPendataan({ pelangganId: inst.id, kode: v.kode, unitId: v.unitId, gedung, label: v.label, noAc: v.tanpaAset ? '' : v.noAc, merk: v.merk, pk: v.pk, tipe: v.tipe, catatan });
    if (!r.ok) { setBusy(''); return toast.error(r.error); }
    onGedung(gedung);
    for (const sisi of ['indoor', 'outdoor'] as const) {
      const b = foto[sisi];
      if (!b) continue;
      setBusy(`Mengirim foto ${sisi}…`);
      const f = await fotoNameplate({ pelangganId: inst.id, unitId: r.data.unitId, sisi, base64: b });
      if (!f.ok) toast.error(`Data tersimpan, tapi foto ${sisi} gagal: ${f.error}`);
    }
    toast.success(`${v.kode} tersimpan · ${gedung} · ${v.label}`);
    setBusy('');
    await onSelesai(lanjut);
  };

  return (
    <>
      <Kepala judul={`${v.unitId ? 'Ubah data' : 'AC baru'} · ${v.kode}`} sub={v.unitId ? 'Stiker ini sudah terdata — perbaiki bila perlu' : `✓ Stiker ${inst.seri} masih kosong, siap diisi`} />
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span className="lbl">Gedung *</span>
          {inst.gedung.length > 0 && <Chips opsi={inst.gedung.map(g => [g, g] as const)} value={diDaftar || ''} onPilih={g => set({ gedung: g })} />}
          <input className="field" style={{ marginTop: 6 }} value={diDaftar ? '' : v.gedung} onChange={e => set({ gedung: e.target.value })} placeholder="✏️ atau ketik nama gedung baru…" />
          {mirip && <span className="hint" style={{ color: 'var(--warn)' }}>Mirip “{mirip}” yang sudah ada. <button type="button" className="linkbtn" onClick={() => set({ gedung: mirip })}>Pakai “{mirip}”</button></span>}
          <span className="hint" style={{ display: 'block' }}>Nama gedung bisa dirapikan nanti di data konsumen; semua AC di gedung itu ikut terganti.</span>
        </div>
        <label className="lbl">Ruangan / kamar *
          <input className="field" value={v.label} onChange={e => set({ label: e.target.value })} placeholder="mis. Ruang Perawat, Kamar 3" />
          {ruangan.length > 0 && <span className="hint">Di gedung ini: {ruangan.map((x, i) => <button key={x} type="button" className="linkbtn" onClick={() => set({ label: x })}>{i ? ' · ' : ''}{x}</button>)}</span>}
        </label>
        <div>
          <label className="lbl">No. aset <span className="sm">(opsional)</span>
            <input className="field" value={v.tanpaAset ? '' : v.noAc} disabled={v.tanpaAset} onChange={e => set({ noAc: e.target.value })} placeholder="mis. 230" />
          </label>
          <label className="sm" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <input type="checkbox" checked={v.tanpaAset} onChange={e => set({ tanpaAset: e.target.checked })} /> Nomor aset tidak ada / sudah hilang
          </label>
        </div>
        <div>
          <span className="lbl">Merk *</span>
          <Chips opsi={[...MERK_AC.map(m => [m, m] as const), ['__lain', 'Lainnya…'] as const]} value={merkLain || merkKetik ? '__lain' : v.merk}
            onPilih={m => { setMerkKetik(m === '__lain'); set({ merk: m === '__lain' ? '' : m }); }} />
          {(merkLain || merkKetik) && <input className="field" style={{ marginTop: 6 }} value={v.merk} onChange={e => set({ merk: e.target.value })} placeholder="Merk lain, ketik di sini" />}
        </div>
        <div>
          <span className="lbl">PK *</span>
          <Chips opsi={PK} value={v.pk} onPilih={pk => set({ pk })} />
          <input className="field" style={{ marginTop: 6, maxWidth: 160 }} value={pkLain ? v.pk : ''} onChange={e => set({ pk: e.target.value })} placeholder="PK lain, mis. 6" />
        </div>
        <div>
          <span className="lbl">Tipe</span>
          <Chips opsi={TIPE_AC.map(t => [t, t] as const)} value={v.tipe} onPilih={tipe => set({ tipe })} />
        </div>
        <div>
          <span className="lbl">Foto name plate <span className="sm">(opsional)</span></span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['indoor', 'outdoor'] as const).map(s => {
              const baru = foto[s], lama = s === 'indoor' ? unitLama?.fotoIndoor : unitLama?.fotoOutdoor;
              const src = baru || (lama ? `/api/foto/${lama}` : '');
              return (
                <button key={s} type="button" onClick={() => { sisiRef.current = s; input.current?.click(); }}
                  style={{ border: `1.5px ${src ? 'solid var(--good)' : 'dashed #b8c3d0'}`, borderRadius: 10, aspectRatio: '4 / 3', overflow: 'hidden', background: 'var(--card, #fff)', padding: 0, position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src ? <img src={src} alt={`Name plate ${s}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="sm">📷 {s === 'indoor' ? 'Indoor' : 'Outdoor'}</span>}
                  {src && <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgb(0 0 0 / .6)', color: '#fff', fontSize: '.72rem', padding: '2px 6px', borderRadius: 6 }}>{s} · ganti</span>}
                </button>
              );
            })}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => ambilFoto(e.target.files?.[0])} />
          <label className="sm" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <input type="checkbox" checked={v.tanpaPlat} onChange={e => set({ tanpaPlat: e.target.checked })} /> Name plate tidak ada
          </label>
        </div>
        <label className="lbl">Catatan <span className="sm">(opsional)</span>
          <textarea className="field" value={v.catatan} onChange={e => set({ catatan: e.target.value })} placeholder="mis. outdoor di atap, remote hilang" style={{ minHeight: 56 }} />
        </label>
      </div>
      <Button size="lg" disabled={!!busy} onClick={() => simpan(true)} style={{ fontWeight: 800 }}>{busy || '💾 Simpan & scan berikutnya'}</Button>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <Button variant="outline" disabled={!!busy} onClick={() => simpan(false)}>Simpan saja</Button>
        <Button variant="ghost" disabled={!!busy} onClick={onBatal}>Batal</Button>
      </div>
    </>
  );
}
