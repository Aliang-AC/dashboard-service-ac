'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveTarif } from '@/app/actions';
import { MEREK_LENGKAP, TAGLINE, WA_USAHA_TAMPIL } from '@/lib/brand';
import { rp, waNumber } from '@/lib/format';
import { angkaPk, fmtPk, JENIS_HARGA, teksPricelist, totalPaket, type JenisHarga, type PaketAC, type Tarif, type TarifLayanan } from '@/lib/tarif';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { salinWa } from './invoice';

const idBaru = () => Math.random().toString(36).slice(2, 10);
const angka = (v: string) => Math.max(0, Math.round(+v.replace(/[^\d]/g, '') || 0));
const ribu = (n?: number) => (n ? n.toLocaleString('id-ID') : '');
const KOP = { merek: MEREK_LENGKAP, tagline: TAGLINE, wa: WA_USAHA_TAMPIL };

/* Menu Daftar Harga (pemilik & admin): layanan per PK / tetap / saat pengecekan / diisi admin, dan paket AC baru. */
export function HargaView() {
  const { d, run, open } = useDash();
  const [t, setT] = useState<Tarif>(() => structuredClone(d.tarif));
  const [tab, setTab] = useState<string>(d.tarif.layanan[0]?.id || 'paket');
  const [busy, setBusy] = useState(false);
  const berubah = JSON.stringify(t) !== JSON.stringify(d.tarif);
  const setL = (id: string, patch: Partial<TarifLayanan>) => setT(x => ({ ...x, layanan: x.layanan.map(l => (l.id === id ? { ...l, ...patch } : l)) }));
  const setP = (id: string, patch: Partial<PaketAC>) => setT(x => ({ ...x, paket: x.paket.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
  const l = t.layanan.find(x => x.id === tab);
  const merks = [...new Set(t.paket.map(p => p.merk))];
  const simpan = async () => { setBusy(true); await run(saveTarif(t), 'Daftar harga tersimpan'); setBusy(false); };

  return (
    <>
      <div className="section-head">
        <div><h2>Daftar harga</h2><p>Hanya untuk pemilik & admin. Harga di sini otomatis dipakai saat membuat order (tetap bisa diubah per order).</p></div>
        <div className="actions">
          <Button variant="outline" disabled={berubah} onClick={() => open({ kind: 'kirimHarga' })} title={berubah ? 'Simpan perubahan dulu' : ''}>💬 Kirim daftar harga</Button>
          <Button disabled={!berubah || busy} onClick={simpan}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</Button>
        </div>
      </div>
      {berubah && <p className="banner">Ada perubahan yang belum disimpan.</p>}
      <div className="toolbar">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {t.layanan.map(x => <button key={x.id} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>{x.nama || '(tanpa nama)'}</button>)}
          <button aria-pressed={tab === 'paket'} onClick={() => setTab('paket')}>Paket AC Baru · {t.paket.length}</button>
          <button onClick={() => { const n: TarifLayanan = { id: idBaru(), nama: 'Layanan baru', jenis: 'pk' }; setT(x => ({ ...x, layanan: [...x.layanan, n] })); setTab(n.id); }}>+ Layanan</button>
        </div>
      </div>

      {l ? (
        <div className="panel" style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid2">
            <label className="lbl span2">Nama layanan<input className="field" value={l.nama} onChange={e => setL(l.id, { nama: e.target.value })} /></label>
            <label className="lbl">Jenis harga
              <select className="field" value={l.jenis} onChange={e => setL(l.id, { jenis: e.target.value as JenisHarga })}>
                {Object.entries(JENIS_HARGA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {l.jenis === 'tetap' && <label className="lbl">Harga (Rp)<input className="field num" inputMode="numeric" value={ribu(l.harga)} onChange={e => setL(l.id, { harga: angka(e.target.value) })} /></label>}
            {l.jenis === 'pk' && <>
              <label className="lbl">AC 0,5–1 PK (Rp)<input className="field num" inputMode="numeric" value={ribu(l.harga1)} onChange={e => setL(l.id, { harga1: angka(e.target.value) })} /></label>
              <label className="lbl">AC 1,5–2 PK (Rp)<input className="field num" inputMode="numeric" value={ribu(l.harga2)} onChange={e => setL(l.id, { harga2: angka(e.target.value) })} /></label>
              <label className="lbl">Tambahan AC inverter (Rp)<input className="field num" inputMode="numeric" value={ribu(l.inverter)} onChange={e => setL(l.id, { inverter: angka(e.target.value) })} /></label>
            </>}
            <label className="lbl span2">Keterangan di daftar harga WA <span className="sm">(opsional — mis. area, tindakan)</span>
              <textarea className="field" value={l.ket || ''} onChange={e => setL(l.id, { ket: e.target.value })} style={{ minHeight: 70 }} />
            </label>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            {l.jenis === 'pk' ? 'Di order, harga dipilih otomatis dari PK unit AC (0,5–1 PK atau 1,5–2 PK) + tambahan kalau unitnya inverter. AC di atas 2 PK atau yang PK-nya belum dikonfirmasi: harga diisi manual.'
              : l.jenis === 'tetap' ? 'Satu harga untuk semua unit.'
              : l.jenis === 'cek' ? 'Harga dikosongkan di order dan ditandai oranye — diisi setelah teknisi mengecek.'
              : 'Harga dikosongkan di order dan diisi pemilik/admin (mis. biaya layanan / transport luar kota).'}
          </p>
          <div><Button variant="ghost" size="sm" onClick={() => { setT(x => ({ ...x, layanan: x.layanan.filter(y => y.id !== l.id) })); setTab(t.layanan.find(y => y.id !== l.id)?.id || 'paket'); }}>Hapus layanan ini</Button></div>
        </div>
      ) : (
        <PaketEditor t={t} setT={setT} setP={setP} merks={merks} />
      )}
    </>
  );
}

function PaketEditor({ t, setT, setP, merks }: { t: Tarif; setT: (f: (x: Tarif) => Tarif) => void; setP: (id: string, p: Partial<PaketAC>) => void; merks: string[] }) {
  const { d } = useDash();
  const [buka, setBuka] = useState<string | null>(null);
  const stok = d.stok.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const list = t.paket.slice().sort((a, b) => a.merk.localeCompare(b.merk) || (angkaPk(a.pk) || 0) - (angkaPk(b.pk) || 0));
  const info = t.infoPaket;
  const setInfo = (patch: Partial<Tarif['infoPaket']>) => setT(x => ({ ...x, infoPaket: { ...x.infoPaket, ...patch } }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tablebox">
        <table>
          <thead><tr><th>Merk</th><th>PK</th><th>Tipe</th><th className="r">Watt</th><th className="r">Unit AC</th><th className="r">Alat lengkap</th><th className="r">Jasa pasang</th><th className="r">Total</th><th>Stok</th><th></th></tr></thead>
          <tbody>
            {list.map(p => {
              const unitStok = p.stok?.[0] ? d.stok.find(s => s.id === p.stok![0].itemId) : undefined;
              return (
                <tr key={p.id} style={p.nonaktif ? { opacity: .5 } : undefined}>
                  <td><input className="field" value={p.merk} list="merkPaket" onChange={e => setP(p.id, { merk: e.target.value })} style={{ width: 90 }} /></td>
                  <td><input className="field" value={p.pk} onChange={e => setP(p.id, { pk: e.target.value })} style={{ width: 60 }} placeholder="1" /></td>
                  <td><select className="field" style={{ minWidth: 112 }} value={p.tipe} onChange={e => setP(p.id, { tipe: e.target.value as PaketAC['tipe'] })}><option>Standard</option><option>Inverter</option></select></td>
                  <td><input className="field num" value={ribu(p.watt)} onChange={e => setP(p.id, { watt: angka(e.target.value) })} style={{ width: 70 }} /></td>
                  <td><input className="field num" value={ribu(p.hargaUnit)} onChange={e => setP(p.id, { hargaUnit: angka(e.target.value) })} style={{ width: 105 }} /></td>
                  <td><input className="field num" value={ribu(p.hargaAlat)} onChange={e => setP(p.id, { hargaAlat: angka(e.target.value) })} style={{ width: 95 }} /></td>
                  <td><input className="field num" value={ribu(p.jasa)} onChange={e => setP(p.id, { jasa: angka(e.target.value) })} style={{ width: 95 }} /></td>
                  <td className="r num" style={{ whiteSpace: 'nowrap' }}><b>{rp(totalPaket(p))}</b></td>
                  <td className="sm">{p.stok?.length ? <>{p.stok.length} barang{unitStok ? <div>sisa unit: {unitStok.qty}</div> : null}</> : <span style={{ color: 'var(--warn)' }}>belum diatur</span>}
                    <div><button className="linkbtn" onClick={() => setBuka(buka === p.id ? null : p.id)}>{buka === p.id ? 'tutup' : 'atur stok'}</button></div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="xs" variant="ghost" onClick={() => setP(p.id, { nonaktif: !p.nonaktif })}>{p.nonaktif ? 'Aktifkan' : 'Sembunyikan'}</Button>
                    <Button size="xs" variant="ghost" onClick={() => setT(x => ({ ...x, paket: x.paket.filter(y => y.id !== p.id) }))}>Hapus</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="merkPaket">{merks.map(m => <option key={m} value={m} />)}</datalist>
      {buka && (() => {
        const p = t.paket.find(x => x.id === buka)!;
        const rows = p.stok || [];
        const setRows = (r: { itemId: string; qty: number }[]) => setP(p.id, { stok: r });
        return (
          <fieldset className="box">
            <legend>Stok yang berkurang per paket · {p.merk} {fmtPk(p.pk)}</legend>
            <p className="hint" style={{ margin: 0 }}>Baris pertama = unit AC-nya. Lalu alat: pipa (2 m), kabel (5 m), MCB, bracket, dll. Barang harus sudah ada di menu Stok.</p>
            {rows.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 34px', gap: 6 }}>
                <select className="field" value={x.itemId} onChange={e => setRows(rows.map((y, j) => (j === i ? { ...y, itemId: e.target.value } : y)))}>
                  <option value="">Pilih barang stok…</option>
                  {stok.map(s => <option key={s.id} value={s.id}>{s.nama} ({s.satuan})</option>)}
                </select>
                <input className="field" type="number" min={0} step="any" value={x.qty} onChange={e => setRows(rows.map((y, j) => (j === i ? { ...y, qty: +e.target.value || 0 } : y)))} aria-label="Jumlah" />
                <Button type="button" variant="outline" size="icon" aria-label="Hapus" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
            <div className="actions">
              <Button size="sm" variant="outline" disabled={!stok.length} onClick={() => setRows([...rows, { itemId: '', qty: 1 }])}>+ Barang</Button>
              {!stok.length && <span className="hint">Tambahkan unit AC & alat di menu Stok dulu.</span>}
            </div>
          </fieldset>
        );
      })()}
      <div><Button size="sm" variant="outline" onClick={() => setT(x => ({ ...x, paket: [...x.paket, { id: idBaru(), merk: merks[0] || '', pk: '', tipe: 'Standard', hargaUnit: 0, hargaAlat: 0, jasa: 0 }] }))}>+ Tambah paket</Button></div>
      <fieldset className="box">
        <legend>Info untuk semua paket</legend>
        <div className="grid2">
          <label className="lbl">Garansi (tampil di daftar harga)<input className="field" value={info.garansi || ''} onChange={e => setInfo({ garansi: e.target.value })} placeholder="Garansi 5 tahun (sparepart) + 10 tahun (kompresor)" /></label>
          <label className="lbl">Masa garansi dicatat di unit (bulan)<input className="field" type="number" min={0} max={240} value={info.garansiBulan || ''} onChange={e => setInfo({ garansiBulan: +e.target.value || 0 })} placeholder="60" /></label>
          <label className="lbl span2">Isi alat standar (bawaan toko)<textarea className="field" value={info.alatStandar || ''} onChange={e => setInfo({ alatStandar: e.target.value })} style={{ minHeight: 60 }} /></label>
        </div>
      </fieldset>
    </div>
  );
}

/* Kirim daftar harga sesuai pertanyaan konsumen: centang kategori → pesan WA siap kirim. */
export function KirimHargaDialog({ onClose }: { onClose: () => void }) {
  const { d, open } = useDash();
  const t = d.tarif;
  const merks = [...new Set(t.paket.filter(p => !p.nonaktif).map(p => p.merk))];
  const [lay, setLay] = useState<string[]>([]);
  const [merk, setMerk] = useState<string[]>([]);
  const [pid, setPid] = useState('');
  const [nomor, setNomor] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const otomatis = teksPricelist(t, { layanan: lay, merk }, KOP);
  const teks = edit ?? otomatis;
  const tujuan = waNumber(pid ? d.pelanggan.find(p => p.id === pid)?.hp || '' : nomor);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const pel = d.pelanggan.filter(p => p.hp).sort((a, b) => a.nama.localeCompare(b.nama));
  return (
    <FormDialog title="Kirim daftar harga" onClose={onClose} submitLabel="Tutup">
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="lbl">Kategori yang ditanyakan konsumen</span>
          {t.layanan.map(l => (
            <label key={l.id} className="panel" style={{ display: 'flex', gap: 8, padding: '8px 10px', cursor: 'pointer', borderColor: lay.includes(l.id) ? 'var(--brand)' : undefined }}>
              <input type="checkbox" checked={lay.includes(l.id)} onChange={() => { setLay(x => toggle(x, l.id)); setEdit(null); }} />
              <span><b>{l.nama}</b><br /><span className="sm">{l.jenis === 'pk' ? `${rp(l.harga1)} – ${rp(l.harga2)}${l.inverter ? ` · +${rp(l.inverter)} inverter` : ''}` : l.jenis === 'tetap' ? rp(l.harga) : JENIS_HARGA[l.jenis]}</span></span>
            </label>
          ))}
          {merks.length > 0 && (
            <div className="panel" style={{ padding: '8px 10px' }}>
              <b>Paket AC Baru</b>
              <div className="actions" style={{ marginTop: 4 }}>
                {merks.map(m => <label key={m} className="sm" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={merk.includes(m)} onChange={() => { setMerk(x => toggle(x, m)); setEdit(null); }} />{m}</label>)}
              </div>
            </div>
          )}
          <label className="lbl" style={{ marginTop: 6 }}>Kirim ke
            <select className="field" value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">Nomor lain (ketik)…</option>
              {pel.map(p => <option key={p.id} value={p.id}>{p.nama} · {p.hp}</option>)}
            </select>
          </label>
          {!pid && <input className="field" inputMode="tel" value={nomor} onChange={e => setNomor(e.target.value)} placeholder="08xxxxxxxxxx" />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="lbl">Pesan WA (bisa diubah sebelum dikirim)</span>
          <textarea className="field" value={teks} onChange={e => setEdit(e.target.value)} style={{ minHeight: 360, fontSize: '.85rem' }} placeholder="Centang kategori di sebelah kiri…" />
          <div className="actions">
            <Button type="button" disabled={!teks} onClick={() => salinWa(teks, () => open({ kind: 'text', title: 'Daftar harga', text: teks }))}>📋 Salin pesan</Button>
            <Button type="button" variant="outline" disabled={!teks || !tujuan} nativeButton={false}
              render={<a href={tujuan ? `https://wa.me/${tujuan}?text=${encodeURIComponent(teks)}` : undefined} target="_blank" rel="noopener noreferrer" />}>💬 Kirim ke WA</Button>
            {edit != null && <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Kembalikan teks otomatis</Button>}
          </div>
          {!tujuan && teks && <span className="hint">Isi nomor tujuan untuk tombol “Kirim ke WA”, atau pakai “Salin pesan”.</span>}
        </div>
      </div>
    </FormDialog>
  );
}
