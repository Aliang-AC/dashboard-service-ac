'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { bukaRoll, deleteStok, saveStok, stokKoreksi, stokMasuk } from '@/app/actions';
import { isLow, KATEGORI, SATUAN } from '@/lib/derive';
import { fmtD, rp } from '@/lib/format';
import { ringkasRoll, totalStok } from '@/lib/stok';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

export function StokView() {
  const { d, open } = useDash();
  const [q, setQ] = useState('');
  const qq = q.trim().toLowerCase();
  const list = d.stok
    .filter(s => !qq || [s.nama, s.kategori].join(' ').toLowerCase().includes(qq))
    .sort((a, b) => +isLow(b) - +isLow(a) || (a.kategori || '').localeCompare(b.kategori || '') || a.nama.localeCompare(b.nama));
  const nilai = d.stok.reduce((a, s) => a + totalStok(s) * (+(s.hargaBeli || 0)), 0);
  const lowN = d.stok.filter(isLow).length;
  const owner = d.me.peran === 'owner'; // harga modal hanya untuk pemilik

  return (
    <>
      <div className="section-head">
        <div><h2>Stok barang</h2><p>Freon, pipa, kabel, sparepart dan unit. Barang roll (pipa, kabel) dicatat per roll utuh + sisa eceran; roll dibuka otomatis kalau eceran kurang. Baris oranye/merah perlu dibelanjakan.</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'stok' })}>+ Barang baru</Button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lab">Jenis barang</span><span className="val">{d.stok.length}</span><span className="note">terdaftar</span></div>
        <div className={`kpi${lowN ? ' alert' : ''}`}><span className="lab">Menipis / habis</span><span className="val">{lowN}</span><span className="note">di bawah batas minimum</span></div>
        {owner && <div className="kpi"><span className="lab">Nilai stok (modal)</span><span className="val">{rp(nilai)}</span><span className="note">qty × harga beli</span></div>}
      </div>
      <div className="toolbar"><input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari barang…" /></div>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Barang</th><th>Kategori</th><th className="r">Sisa</th><th className="r">Min.</th>{owner && <th className="r">Harga beli</th>}<th className="r">Harga konsumen</th><th className="r">Harga mitra</th><th></th></tr></thead>
            <tbody>
              {list.map(s => {
                const out = totalStok(s) <= 0, low = isLow(s);
                return (
                  <tr key={s.id} className={out ? 'out' : low ? 'low' : ''}>
                    <td><b>{s.nama}</b>{out ? <> <span className="pill bad">Habis</span></> : low ? <> <span className="pill warn">Menipis</span></> : null}</td>
                    <td>{s.kategori}</td>
                    <td className="r num">{totalStok(s)} <span className="sm">{s.satuan}</span>{s.roll && <div className="sm">{ringkasRoll(s)}</div>}</td>
                    <td className="r num">{+s.min || 0}</td>
                    {owner && <td className="r num">{rp(s.hargaBeli)}</td>}
                    <td className="r num">{rp(s.hargaJual)}</td>
                    <td className="r num">{s.hargaMitra ? rp(s.hargaMitra) : <span className="sm">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => open({ kind: 'stok-in', id: s.id, adj: false })}>+ Masuk</Button>{' '}
                      {s.roll && !!s.rolls?.length && <><Button size="sm" variant="outline" onClick={() => open({ kind: 'stok-buka', id: s.id })}>Buka roll</Button>{' '}</>}
                      <Button size="sm" variant="outline" onClick={() => open({ kind: 'stok-in', id: s.id, adj: true })}>Hitung ulang</Button>{' '}
                      <Button size="sm" variant="outline" onClick={() => open({ kind: 'stok', id: s.id })}>Ubah</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty"><b>Daftar stok masih kosong</b>Tambahkan barang seperti “Freon R32”, “Pipa AC 1/4 + 3/8” atau “Kapasitor 35µF” lewat tombol “Barang baru”.</div>
      )}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Riwayat keluar-masuk terakhir</h3>
        {d.mutasi.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Tanggal</th><th>Barang</th><th>Jenis</th><th className="r">Qty</th><th>Keterangan</th></tr></thead>
              <tbody>
                {d.mutasi.slice(0, 25).map(m => (
                  <tr key={m.id}>
                    <td className="num">{fmtD(m.tanggal)}</td><td>{m.nama}</td>
                    <td><span className={`pill ${m.jenis === 'Masuk' || m.jenis === 'Kembali' ? 'good' : m.jenis === 'Keluar' ? 'accent' : m.jenis === 'Buka roll' ? '' : 'brand'}`}>{m.jenis}</span></td>
                    <td className="r num">{m.qty}</td><td className="sm">{m.ket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Belum ada pergerakan stok.</div>
        )}
      </div>
    </>
  );
}

/* Editor daftar roll utuh: tiap roll bisa beda panjang (mis. 30, 20, 15 m). */
function RollEditor({ rolls, setRolls, panjang, satuan }: { rolls: number[]; setRolls: (r: number[]) => void; panjang: number; satuan: string }) {
  const [n, setN] = useState(1);
  const [p, setP] = useState(panjang || 30);
  return (
    <div className="span2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="actions" style={{ alignItems: 'center' }}>
        <input className="field num" type="number" min={1} max={100} value={n} onChange={e => setN(Math.max(1, Math.min(100, +e.target.value || 1)))} style={{ width: 70 }} aria-label="Jumlah roll" />
        <span>roll ×</span>
        <input className="field num" type="number" min={0.5} step="any" value={p} onChange={e => setP(+e.target.value || 0)} style={{ width: 90 }} aria-label="Panjang per roll" />
        <span>{satuan}</span>
        <Button type="button" variant="secondary" size="sm" disabled={!(p > 0)} onClick={() => setRolls([...rolls, ...Array<number>(n).fill(p)])}>+ Tambah roll</Button>
      </div>
      {rolls.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rolls.map((x, i) => (
            <span key={i} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Roll {i + 1}:
              <input className="num" type="number" min={0.5} step="any" value={x} aria-label={`Panjang roll ${i + 1}`}
                onChange={e => setRolls(rolls.map((y, j) => (j === i ? +e.target.value || 0 : y)))}
                style={{ width: 52, background: 'transparent', border: 0, font: 'inherit', textAlign: 'right' }} />
              {satuan}
              <button type="button" onClick={() => setRolls(rolls.filter((_, j) => j !== i))} aria-label={`Hapus roll ${i + 1}`} style={{ marginLeft: 2, cursor: 'pointer' }}>×</button>
            </span>
          ))}
        </div>
      ) : <span className="hint">Belum ada roll utuh.</span>}
    </div>
  );
}

export function StokDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run } = useDash();
  const s = id ? d.stok.find(x => x.id === id) : undefined;
  const owner = d.me.peran === 'owner';
  const [kategori, setKategori] = useState(s?.kategori || KATEGORI[0]);
  const [roll, setRoll] = useState(!!s?.roll);
  const [panjang, setPanjang] = useState(s?.panjangRoll || 30);
  const [rolls, setRolls] = useState<number[]>([]);
  const perM = roll ? ' per meter' : '';
  return (
    <FormDialog
      title={s ? 'Ubah barang' : 'Barang baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        const v = {
          nama: f.nama, kategori: f.kategori, satuan: f.satuan, min: +f.min || 0, hargaBeli: +f.hargaBeli || 0, hargaJual: +f.hargaJual || 0, hargaMitra: +f.hargaMitra || 0, qty: +f.qty || 0,
          roll, panjangRoll: panjang, rolls: rolls.filter(x => x > 0),
        };
        return run(saveStok(s?.id || null, v), s ? 'Barang diperbarui' : 'Barang ditambahkan');
      }}
      onDelete={s && owner ? () => run(deleteStok(s.id), 'Barang dihapus') : undefined}
    >
      <div className="grid2">
        <label className="lbl span2">Nama barang<input className="field" name="nama" required defaultValue={s?.nama || ''} placeholder="mis. Pipa AC 1/4 + 3/8" autoFocus /></label>
        <label className="lbl">Kategori<select className="field" name="kategori" value={kategori} onChange={e => { setKategori(e.target.value); if (!s && e.target.value === 'Pipa & kabel') setRoll(true); }}>{KATEGORI.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="lbl">Satuan<select className="field" name="satuan" key={String(roll)} defaultValue={s?.satuan || (roll ? 'meter' : SATUAN[0])}>{SATUAN.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="span2" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input type="checkbox" checked={roll} onChange={e => setRoll(e.target.checked)} style={{ marginTop: 4 }} />
          <span>Barang roll (pipa AC, kabel listrik, selang, dll.) — stok dicatat per roll utuh + sisa eceran, dipakai per meter</span>
        </label>
        {roll && <label className="lbl">Panjang 1 roll bawaan (meter)<input className="field" type="number" min={0.5} step="any" value={panjang} onChange={e => setPanjang(+e.target.value || 0)} /></label>}
        {!s && <label className="lbl">{roll ? 'Stok awal eceran (sisa roll terbuka)' : 'Stok awal'}<input className="field" type="number" name="qty" min={0} step="any" defaultValue={0} /></label>}
        {!s && roll && <><span className="lbl span2">Stok awal roll utuh</span><RollEditor rolls={rolls} setRolls={setRolls} panjang={panjang} satuan="m" /></>}
        {s && roll && !s.roll && <p className="hint span2">Stok sekarang ({+s.qty || 0}) akan dianggap eceran. Tambahkan roll utuh lewat “+ Masuk” atau “Hitung ulang”.</p>}
        {s && !roll && s.roll && !!s.rolls?.length && <p className="hint span2">Roll utuh yang tersisa ({ringkasRoll(s)}) akan digabung jadi stok biasa.</p>}
        <label className="lbl">Batas minimum{roll ? ' (total meter)' : ''}<input className="field" type="number" name="min" min={0} step="any" defaultValue={s?.min ?? 1} /></label>
        {owner && <label className="lbl">Harga beli{perM} (Rp)<input className="field" type="number" name="hargaBeli" min={0} step={50} defaultValue={s?.hargaBeli ?? ''} /></label>}
        <label className="lbl">Harga jual konsumen{perM} (Rp)<input className="field" type="number" name="hargaJual" min={0} step={50} defaultValue={s?.hargaJual ?? ''} /></label>
        <label className="lbl">Harga mitra{perM} (Rp) <span className="sm">(teknisi luar / toko / subdealer)</span><input className="field" type="number" name="hargaMitra" min={0} step={50} defaultValue={s?.hargaMitra || ''} placeholder="kosong = sama dengan harga konsumen" /></label>
      </div>
    </FormDialog>
  );
}

export function StokInDialog({ id, adj, onClose }: { id: string; adj: boolean; onClose: () => void }) {
  const { d, run } = useDash();
  const s = d.stok.find(x => x.id === id);
  const [rolls, setRolls] = useState<number[]>(() => (adj ? [...(s?.rolls || [])] : []));
  if (!s) return null;
  const sat = s.satuan || 'meter';
  return (
    <FormDialog
      wide={!!s.roll}
      title={adj ? `Hitung ulang · ${s.nama}` : `Stok masuk · ${s.nama}`}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        const r = rolls.filter(x => x > 0);
        return adj
          ? run(stokKoreksi(s.id, +f.qty, f.ket, s.roll ? r : undefined), 'Stok dikoreksi')
          : run(stokMasuk(s.id, +f.qty || 0, +f.harga, f.ket, r), 'Stok masuk dicatat');
      }}
    >
      {adj ? (
        <>
          <p className="hint">Sisa tercatat: <b className="num">{s.roll ? ringkasRoll(s) : `${+s.qty || 0} ${sat}`}</b>. Masukkan hasil hitung fisik di gudang.</p>
          <div className="grid2">
            {s.roll && <><span className="lbl span2">Roll utuh yang ada (ubah panjang, hapus, atau tambah)</span><RollEditor rolls={rolls} setRolls={setRolls} panjang={s.panjangRoll || 30} satuan={sat} /></>}
            <label className="lbl">{s.roll ? `Sisa eceran (${sat})` : 'Jumlah sebenarnya'}<input className="field" type="number" name="qty" step="any" min={0} required defaultValue={+s.qty || 0} autoFocus /></label>
            <label className="lbl">Alasan<input className="field" name="ket" placeholder="mis. stock opname" /></label>
          </div>
        </>
      ) : (
        <div className="grid2">
          {s.roll && <><span className="lbl span2">Roll utuh yang masuk</span><RollEditor rolls={rolls} setRolls={setRolls} panjang={s.panjangRoll || 30} satuan={sat} /></>}
          <label className="lbl">{s.roll ? `Tambahan eceran (${sat}, boleh kosong)` : `Jumlah masuk (${sat})`}<input className="field" type="number" name="qty" step="any" min={0} required={!s.roll} autoFocus={!s.roll} /></label>
          {d.me.peran === 'owner' && <label className="lbl">Harga beli per {s.roll ? sat : 'satuan'} (Rp)<input className="field" type="number" name="harga" min={0} step={50} defaultValue={+(s.hargaBeli || 0) || ''} /></label>}
          <label className="lbl span2">Supplier / keterangan<input className="field" name="ket" placeholder="mis. Toko Sinar Teknik" /></label>
          {s.roll && !!rolls.length && <p className="hint span2">Masuk: {rolls.length} roll, total {rolls.reduce((a, x) => a + x, 0).toLocaleString('id-ID')} {sat}.</p>}
        </div>
      )}
    </FormDialog>
  );
}

/* Buka satu roll utuh secara manual → panjangnya pindah ke eceran (saat dipakai di order, roll juga terbuka otomatis). */
export function BukaRollDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { d, run } = useDash();
  const [busy, setBusy] = useState(false);
  const s = d.stok.find(x => x.id === id);
  if (!s) return null;
  const sat = s.satuan || 'meter';
  return (
    <FormDialog wide={false} title={`Buka roll · ${s.nama}`} onClose={onClose} submitLabel="Tutup">
      <p className="hint">Sekarang: <b>{ringkasRoll(s)}</b>. Pilih roll yang dibuka — panjangnya pindah ke eceran. Untuk pemakaian di order tidak perlu: kalau eceran kurang, roll dibuka otomatis.</p>
      {(s.rolls || []).length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(s.rolls || []).map((x, i) => (
            <div key={i} className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Roll {i + 1} · <b className="num">{x.toLocaleString('id-ID')} {sat}</b></span>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); await run(bukaRoll(s.id, i), `Roll ${x} ${sat} dibuka`); setBusy(false); }}>Buka</Button>
            </div>
          ))}
        </div>
      ) : <div className="empty">Tidak ada roll utuh.</div>}
    </FormDialog>
  );
}
