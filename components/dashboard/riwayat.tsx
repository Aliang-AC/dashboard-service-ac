'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { hapusPermanen, pulihkanSampah } from '@/app/actions';
import { useDash } from './ctx';

const JENIS: Record<string, string> = { orders: 'Order / penjualan', pelanggan: 'Pelanggan', stok: 'Barang stok', catatan: 'Catatan', absensi: 'Absensi', karyawan: 'Karyawan' };
const PERAN: Record<string, string> = { owner: 'Pemilik', admin: 'Admin', karyawan: 'Karyawan', layar: 'Perangkat' };
const waktu = (at: number) => new Date(at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

/* Khusus pemilik: tempat sampah (pulihkan / hapus permanen) dan riwayat siapa mengubah apa. */
export function RiwayatView() {
  const { d, run } = useDash();
  const [q, setQ] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const qq = q.trim().toLowerCase();
  const riwayat = d.riwayat.filter(r => !qq || [r.oleh, r.aksi, r.judul, r.detail].join(' ').toLowerCase().includes(qq));
  return (
    <>
      <div className="section-head">
        <div><h2>Riwayat &amp; tempat sampah</h2><p>Khusus pemilik. Data yang dihapus masuk tempat sampah dan bisa dipulihkan sampai 30 hari, lalu terhapus otomatis.</p></div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Tempat sampah · {d.sampah.length}</h3>
        {d.sampah.length ? (
          <ul className="list">
            {d.sampah.map(x => {
              const sisa = Math.max(0, Math.ceil((x.hapusPada - Date.parse(d.today + 'T00:00:00+07:00')) / 86_400_000));
              return (
                <li key={x.id}>
                  <div className="main"><b>{x.judul || '(tanpa nama)'}</b><div className="meta">{JENIS[x.koleksi] || x.koleksi} · dihapus {x.oleh}, {waktu(x.at)} · terhapus otomatis {sisa} hari lagi</div></div>
                  <span className="actions">
                    <Button size="sm" onClick={() => run(pulihkanSampah(x.id), 'Data dipulihkan')}>Pulihkan</Button>
                    <Button size="sm" variant="destructive" onClick={async () => { if (armed !== x.id) return setArmed(x.id); await run(hapusPermanen(x.id), 'Dihapus permanen'); setArmed(null); }}>
                      {armed === x.id ? 'Yakin hapus permanen?' : 'Hapus permanen'}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <div className="empty">Tempat sampah kosong.</div>}
      </div>
      <div className="panel">
        <h3>Riwayat perubahan <span className="sm">(300 terakhir)</span></h3>
        <input type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama orang, aksi, pelanggan, invoice…" style={{ marginBottom: 10 }} />
        {riwayat.length ? (
          <div className="tablebox" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Waktu</th><th>Oleh</th><th>Aksi</th><th>Data</th><th>Keterangan</th></tr></thead>
              <tbody>
                {riwayat.map(r => (
                  <tr key={r.id}>
                    <td className="num sm" style={{ whiteSpace: 'nowrap' }}>{waktu(r.at)}</td>
                    <td>{r.oleh}<div className="sm">{PERAN[r.peran] || r.peran}</div></td>
                    <td>{r.aksi}</td>
                    <td className="sm">{r.judul}</td>
                    <td className="sm">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Belum ada riwayat.</div>}
      </div>
    </>
  );
}
