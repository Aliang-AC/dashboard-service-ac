'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cariOrderLama } from '@/app/actions';
import { STATUS_CLS } from '@/lib/derive';
import { fmtD, rp } from '@/lib/format';
import { ringkasItems } from '@/lib/order';
import type { Order } from '@/lib/types';
import { useDash } from './ctx';

/* Dashboard hanya memuat order ±2–3 bulan terakhir supaya ringan. Kotak ini mencari order dari kapan pun
   (nama pelanggan / no. HP / no. invoice); hasilnya bisa dibuka lengkap dengan foto & invoice. */
export function CariOrderLama() {
  const { d, open, go, tambahOrder } = useDash();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<Order[] | null>(null);
  const cari = async () => {
    setBusy(true);
    const r = await cariOrderLama(q);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    tambahOrder(r.data);
    setHasil(r.data);
  };
  /* tampilkan versi terbaru dari data dashboard (kalau sudah diubah setelah dicari) */
  const tampil = (hasil || []).map(o => d.orders.find(x => x.id === o.id) || o);
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <form className="actions" onSubmit={e => { e.preventDefault(); if (q.trim().length >= 3) cari(); }}>
        <input type="search" className="field" style={{ flex: 1, minWidth: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Cari order lama: nama pelanggan / no. HP / no. invoice" />
        <Button type="submit" variant="outline" disabled={busy || q.trim().length < 3}>{busy ? 'Mencari…' : 'Cari'}</Button>
        {hasil && <Button type="button" variant="ghost" onClick={() => { setHasil(null); setQ(''); }}>Tutup</Button>}
      </form>
      {hasil && (tampil.length ? (
        <ul className="list" style={{ marginTop: 8 }}>
          {tampil.map(o => (
            <li key={o.id}>
              <span className="time">{fmtD(o.tanggal)}</span>
              <div className="main"><b>{o.pelanggan}</b> · {ringkasItems(o.items) || (o.jual ? 'Penjualan langsung' : '')}
                <div className="meta mono">{o.invoice || 'belum ditagih'} · {rp(o.total)}{o.foto.length ? ` · 📷 ${o.foto.length} foto` : ''}</div></div>
              <span className="actions">
                <span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span>
                <Button size="sm" variant="outline" onClick={() => open(o.jual ? { kind: 'jual', id: o.id, jenis: 'sparepart' } : { kind: 'order', id: o.id })}>Buka</Button>
                <Button size="sm" variant="ghost" onClick={() => go('invoice', { invSel: o.id })}>Invoice</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : <div className="empty">Tidak ada order yang cocok. Coba nama lain, nomor HP lengkap, atau nomor invoice (mis. INV/2026/03/0012).</div>)}
      {hasil && tampil.length >= 100 && <p className="hint">Menampilkan 100 order terbaru yang cocok. Persempit pencarian kalau belum ketemu.</p>}
    </div>
  );
}
