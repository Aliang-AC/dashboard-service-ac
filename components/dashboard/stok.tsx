'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteStok, saveStok, stokKoreksi, stokMasuk } from '@/app/actions';
import { isLow, KATEGORI, SATUAN } from '@/lib/derive';
import { fmtD, rp } from '@/lib/format';
import { formObj, useDash } from './ctx';
import { FormDialog } from './form-dialog';

export function StokView() {
  const { d, open } = useDash();
  const [q, setQ] = useState('');
  const qq = q.trim().toLowerCase();
  const list = d.stok
    .filter(s => !qq || [s.nama, s.kategori].join(' ').toLowerCase().includes(qq))
    .sort((a, b) => +isLow(b) - +isLow(a) || (a.kategori || '').localeCompare(b.kategori || '') || a.nama.localeCompare(b.nama));
  const nilai = d.stok.reduce((a, s) => a + (+s.qty || 0) * (+s.hargaBeli || 0), 0);
  const lowN = d.stok.filter(isLow).length;

  return (
    <>
      <div className="section-head">
        <div><h2>Stok barang</h2><p>Freon, pipa, kabel, sparepart dan unit. Baris bertanda oranye/merah perlu dibelanjakan.</p></div>
        <div className="actions"><Button onClick={() => open({ kind: 'stok' })}>+ Barang baru</Button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lab">Jenis barang</span><span className="val">{d.stok.length}</span><span className="note">terdaftar</span></div>
        <div className={`kpi${lowN ? ' alert' : ''}`}><span className="lab">Menipis / habis</span><span className="val">{lowN}</span><span className="note">di bawah batas minimum</span></div>
        <div className="kpi"><span className="lab">Nilai stok (modal)</span><span className="val">{rp(nilai)}</span><span className="note">qty × harga beli</span></div>
      </div>
      <div className="toolbar"><input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari barang…" /></div>
      {list.length ? (
        <div className="tablebox">
          <table>
            <thead><tr><th>Barang</th><th>Kategori</th><th className="r">Sisa</th><th className="r">Min.</th><th className="r">Harga beli</th><th className="r">Harga jual</th><th></th></tr></thead>
            <tbody>
              {list.map(s => {
                const out = (+s.qty || 0) <= 0, low = isLow(s);
                return (
                  <tr key={s.id} className={out ? 'out' : low ? 'low' : ''}>
                    <td><b>{s.nama}</b>{out ? <> <span className="pill bad">Habis</span></> : low ? <> <span className="pill warn">Menipis</span></> : null}</td>
                    <td>{s.kategori}</td>
                    <td className="r num">{+s.qty || 0} <span className="sm">{s.satuan}</span></td>
                    <td className="r num">{+s.min || 0}</td>
                    <td className="r num">{rp(s.hargaBeli)}</td>
                    <td className="r num">{rp(s.hargaJual)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => open({ kind: 'stok-in', id: s.id, adj: false })}>+ Masuk</Button>{' '}
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
                    <td><span className={`pill ${m.jenis === 'Masuk' || m.jenis === 'Kembali' ? 'good' : m.jenis === 'Keluar' ? 'accent' : 'brand'}`}>{m.jenis}</span></td>
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

export function StokDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const { d, run } = useDash();
  const s = id ? d.stok.find(x => x.id === id) : undefined;
  return (
    <FormDialog
      title={s ? 'Ubah barang' : 'Barang baru'}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        const v = { nama: f.nama, kategori: f.kategori, satuan: f.satuan, min: +f.min || 0, hargaBeli: +f.hargaBeli || 0, hargaJual: +f.hargaJual || 0, qty: +f.qty || 0 };
        return run(saveStok(s?.id || null, v), s ? 'Barang diperbarui' : 'Barang ditambahkan');
      }}
      onDelete={s ? () => run(deleteStok(s.id), 'Barang dihapus') : undefined}
    >
      <div className="grid2">
        <label className="lbl span2">Nama barang<input className="field" name="nama" required defaultValue={s?.nama || ''} placeholder="mis. Freon R32" autoFocus /></label>
        <label className="lbl">Kategori<select className="field" name="kategori" defaultValue={s?.kategori || KATEGORI[0]}>{KATEGORI.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="lbl">Satuan<select className="field" name="satuan" defaultValue={s?.satuan || SATUAN[0]}>{SATUAN.map(k => <option key={k}>{k}</option>)}</select></label>
        {!s && <label className="lbl">Stok awal<input className="field" type="number" name="qty" min={0} step="any" defaultValue={0} /></label>}
        <label className="lbl">Batas minimum<input className="field" type="number" name="min" min={0} step="any" defaultValue={s?.min ?? 1} /></label>
        <label className="lbl">Harga beli (Rp)<input className="field" type="number" name="hargaBeli" min={0} step={500} defaultValue={s?.hargaBeli ?? ''} /></label>
        <label className="lbl">Harga jual (Rp)<input className="field" type="number" name="hargaJual" min={0} step={500} defaultValue={s?.hargaJual ?? ''} /></label>
      </div>
    </FormDialog>
  );
}

export function StokInDialog({ id, adj, onClose }: { id: string; adj: boolean; onClose: () => void }) {
  const { d, run } = useDash();
  const s = d.stok.find(x => x.id === id);
  if (!s) return null;
  return (
    <FormDialog
      wide={false}
      title={adj ? `Hitung ulang · ${s.nama}` : `Stok masuk · ${s.nama}`}
      onClose={onClose}
      onSubmit={form => {
        const f = formObj(form);
        return adj
          ? run(stokKoreksi(s.id, +f.qty, f.ket), 'Stok dikoreksi')
          : run(stokMasuk(s.id, +f.qty, +f.harga, f.ket), 'Stok masuk dicatat');
      }}
    >
      {adj ? (
        <>
          <p className="hint">Sisa tercatat: <b className="num">{+s.qty || 0} {s.satuan}</b>. Masukkan jumlah hasil hitung fisik di gudang.</p>
          <div className="grid2">
            <label className="lbl">Jumlah sebenarnya<input className="field" type="number" name="qty" step="any" min={0} required defaultValue={+s.qty || 0} autoFocus /></label>
            <label className="lbl">Alasan<input className="field" name="ket" placeholder="mis. stock opname" /></label>
          </div>
        </>
      ) : (
        <div className="grid2">
          <label className="lbl">Jumlah masuk ({s.satuan})<input className="field" type="number" name="qty" step="any" min={0} required autoFocus /></label>
          <label className="lbl">Harga beli satuan (Rp)<input className="field" type="number" name="harga" min={0} step={500} defaultValue={+s.hargaBeli || ''} /></label>
          <label className="lbl span2">Supplier / keterangan<input className="field" name="ket" placeholder="mis. Toko Sinar Teknik" /></label>
        </div>
      )}
    </FormDialog>
  );
}
