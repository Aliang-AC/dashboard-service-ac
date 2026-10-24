'use client';
import { Button } from '@/components/ui/button';
import { ringkasRoll, totalStok } from '@/lib/stok';
import { absToday, activeKar, dueNotes, isLow, STATUS_CLS } from '@/lib/derive';
import { fmtD, monthKey, rp } from '@/lib/format';
import { ringkasItems, sisa, telatBayar, umurPiutang } from '@/lib/order';
import { jamMasukTgl } from '@/lib/types';
import { StatusPill, telatMenit } from './absensi';
import { useDash, type Tab } from './ctx';
import { namaTeknisi } from './order';
import { perluDiingatkan } from './pelanggan';
import { jenisOrder, type JenisOrder } from './penjualan';

function Kpi({ lab, val, note, alert, onClick }: { lab: string; val: React.ReactNode; note: React.ReactNode; alert?: boolean; onClick?: () => void }) {
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} className={`kpi${alert ? ' alert' : ''}`} onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <span className="lab">{lab}</span><span className="val">{val}</span><span className="note">{note}</span>
    </div>
  );
}

/* Dashboard: angka & daftar yang langsung terbaca — omzet, piutang, kehadiran, jadwal hari ini, dan yang perlu diurus. */
export function Ringkasan() {
  const { d, go, open } = useDash();
  const t = d.today, m = t.slice(0, 7);
  const owner = d.me.peran === 'owner'; // omzet hanya untuk pemilik
  const selesai = d.orders.filter(o => o.status === 'Selesai');
  const sum = (arr: { total: number }[]) => arr.reduce((a, o) => a + (+o.total || 0), 0);
  const hariIni = selesai.filter(o => o.tanggal === t), bulanIni = selesai.filter(o => monthKey(o.tanggal) === m);
  const perJenis = (jenis: JenisOrder) => sum(bulanIni.filter(o => jenisOrder(d, o) === jenis));

  const jadwal = d.orders.filter(o => o.tanggal === t && o.status !== 'Batal' && !o.jual).sort((a, b) => (a.jam || '99').localeCompare(b.jam || '99'));
  const piutang = d.orders.filter(o => o.status !== 'Batal' && !o.belumDitagih && o.bayar !== 'Lunas');
  const lewatTempo = piutang.filter(o => telatBayar(o, t));
  const belumTagih = d.orders.filter(o => o.belumDitagih && o.status === 'Selesai' && !o.rekapId);
  const kar = activeKar(d), recs = absToday(d), jm = jamMasukTgl(d.settings, t);
  const hadir = kar.filter(k => recs[k.id]?.status === 'Hadir');
  const telat = hadir.filter(k => telatMenit(recs[k.id], jm) > 0).length;
  const low = d.stok.filter(isLow);
  const nIngat = d.pelanggan.filter(p => perluDiingatkan(d, p)).length;
  const nBaru = d.pelanggan.filter(p => p.baru).length, nTek = d.pelanggan.filter(p => p.cekTeknisi).length;
  const tanpaHarga = d.orders.filter(o => o.status !== 'Batal' && o.items.some(i => i.perluHarga));
  const jadwalUlang = d.orders.filter(o => o.status === 'Jadwal ulang');

  const perhatian: { k: string; t: string; m: string; go: Tab }[] = [
    ...lewatTempo.map(o => ({ k: 'bad', t: `Lewat jatuh tempo: ${o.pelanggan}`, m: `${o.invoice} · sisa ${rp(sisa(o))} · tempo ${fmtD(o.jatuhTempo)} (${umurPiutang(o, t)} hari sejak invoice)`, go: 'invoice' as Tab })),
    ...(belumTagih.length ? [{ k: 'warn', t: `${belumTagih.length} pekerjaan instansi belum ditagih`, m: [...new Set(belumTagih.map(o => o.pelanggan))].join(', '), go: 'invoice' as Tab }] : []),
    ...tanpaHarga.map(o => ({ k: 'warn', t: `Harga belum diisi: ${o.pelanggan}`, m: `${fmtD(o.tanggal)} · ${ringkasItems(o.items.filter(i => i.perluHarga))}`, go: 'order' as Tab })),
    ...(nIngat ? [{ k: 'warn', t: `Pengingat servis: ${nIngat} pelanggan`, m: 'Unit AC-nya sudah waktunya dicuci — kirim pengingat WhatsApp', go: 'pengingat' as Tab }] : []),
    ...(nBaru ? [{ k: 'brand', t: `${nBaru} pelanggan baru dari form daftar`, m: 'Cek & lengkapi datanya', go: 'pelanggan' as Tab }] : []),
    ...(nTek ? [{ k: 'brand', t: `${nTek} pelanggan: data unit baru dari teknisi`, m: 'Cek data unit AC yang dicatat di lapangan', go: 'pelanggan' as Tab }] : []),
    ...dueNotes(d).map(n => ({ k: n.tanggal < t ? 'bad' : 'warn', t: `${n.tanggal < t ? 'Terlambat' : 'Hari ini'}: ${n.judul}`, m: n.tipe, go: 'catatan' as Tab })),
    ...jadwalUlang.map(o => ({ k: 'warn', t: `Jadwal ulang: ${o.pelanggan}`, m: `${ringkasItems(o.items)} · semula ${fmtD(o.tanggal)}`, go: 'order' as Tab })),
    ...low.map(s => ({ k: totalStok(s) <= 0 ? 'bad' : 'warn', t: `Stok ${totalStok(s) <= 0 ? 'habis' : 'menipis'}: ${s.nama}`, m: `Sisa ${s.roll ? ringkasRoll(s) : `${totalStok(s)} ${s.satuan || ''}`} · minimum ${+s.min || 0}`, go: 'stok' as Tab })),
  ];

  return (
    <>
      <div className="section-head">
        <div><h2>Dashboard</h2><p>Ringkasan hari ini. Klik kotak atau baris untuk membuka detailnya.</p></div>
        <div className="actions">
          <Button onClick={() => open({ kind: 'order' })}>+ Order baru</Button>
          <Button variant="outline" onClick={() => open({ kind: 'jual', jenis: 'sparepart' })}>+ Penjualan langsung</Button>
          <Button variant="outline" nativeButton={false} render={<a href="/layar-absen" target="_blank" rel="noopener" />}>Layar Absen</Button>
        </div>
      </div>

      <div className="kpis">
        {owner && <Kpi lab="Omzet hari ini" val={rp(sum(hariIni))} note={`${hariIni.length} transaksi selesai`} onClick={() => go('order')} />}
        {owner && <Kpi lab="Omzet bulan ini" val={rp(sum(bulanIni))}
          note={<>Jasa {rp(perJenis('jasa'))} · Unit AC {rp(perJenis('unit'))} · Sparepart {rp(perJenis('sparepart'))}</>} onClick={() => go('jasa')} />}
        <Kpi lab="Piutang" val={rp(piutang.reduce((a, o) => a + sisa(o), 0))} alert={lewatTempo.length > 0} onClick={() => go('invoice')}
          note={`${piutang.length} invoice${lewatTempo.length ? ` · ${lewatTempo.length} lewat tempo` : ''}${belumTagih.length ? ` · ${belumTagih.length} belum ditagih` : ''}`} />
        <Kpi lab="Karyawan hadir" val={`${hadir.length} / ${kar.length}`} alert={telat > 0} onClick={() => go('absensi')}
          note={kar.length ? `${telat ? `${telat} telat · ` : ''}jam masuk ${jm}` : 'belum ada karyawan'} />
      </div>

      <div className="cols">
        <div className="stack">
          <div className="panel">
            <h3>Jadwal hari ini · {jadwal.length} <button className="linkbtn" onClick={() => go('order')}>Semua order</button></h3>
            {jadwal.length ? (
              <ul className="list">
                {jadwal.map(o => (
                  <li key={o.id} style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'order', id: o.id })}>
                    <span className="time">{o.jam || '—'}</span>
                    <div className="main">
                      <b>{o.pelanggan}</b> · {ringkasItems(o.items)}
                      <div className="meta">{o.alamat}{o.teknisi.length ? ' · Teknisi: ' + namaTeknisi(d, o.teknisi) : ' · belum ada teknisi'}</div>
                    </div>
                    <span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="empty"><b>Belum ada jadwal hari ini</b>Tambahkan lewat “+ Order baru”.</div>}
          </div>
          <div className="panel">
            <h3>Absensi hari ini <button className="linkbtn" onClick={() => go('absensi')}>Detail</button></h3>
            {kar.length ? (
              <ul className="list">
                {kar.map(k => {
                  const r = recs[k.id];
                  return (
                    <li key={k.id}>
                      <div className="main"><b>{k.nama}</b><div className="meta">{k.peran}</div></div>
                      <span className="num sm" style={{ minWidth: 92, textAlign: 'right' }}>{r?.masuk ? `masuk ${r.masuk}` : ''}{r?.pulang ? ` · pulang ${r.pulang}` : ''}</span>
                      <StatusPill r={r} k={k} tgl={t} jamMasuk={jm} />
                    </li>
                  );
                })}
              </ul>
            ) : <div className="empty">Belum ada data karyawan.</div>}
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <h3>Perlu diurus · {perhatian.length}</h3>
            {perhatian.length ? (
              <ul className="list">
                {perhatian.slice(0, 20).map((x, i) => (
                  <li key={i} style={{ cursor: 'pointer' }} onClick={() => go(x.go)}>
                    <span className={`pill ${x.k}`}>!</span>
                    <div className="main"><b>{x.t}</b><div className="meta">{x.m}</div></div>
                  </li>
                ))}
              </ul>
            ) : <div className="empty"><b>Semua aman</b>Tidak ada tagihan lewat tempo, stok menipis, atau pekerjaan tertunda.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
