'use client';
import { Button } from '@/components/ui/button';
import { absToday, activeKar, dueNotes, isLow, karName, omzetOrders, STATUS_CLS, unpaid } from '@/lib/derive';
import { addDays, fmtD, monthKey, rp, short } from '@/lib/format';
import type { AllData } from '@/lib/types';
import { useDash, type Tab } from './ctx';

function Kpi({ lab, val, note, alert }: { lab: string; val: React.ReactNode; note: string; alert?: boolean }) {
  return (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <span className="lab">{lab}</span><span className="val">{val}</span><span className="note">{note}</span>
    </div>
  );
}

export function Ringkasan() {
  const { d, go, open } = useDash();
  const t = d.today, m = t.slice(0, 7);
  const owner = d.me.peran === 'owner'; // omzet hanya untuk pemilik
  const om = omzetOrders(d);
  const omToday = om.filter(o => o.tanggal === t);
  const omMonth = om.filter(o => monthKey(o.tanggal) === m);
  const sum = (arr: { total: number }[]) => arr.reduce((a, o) => a + (+o.total || 0), 0);
  const jobsToday = d.orders.filter(o => o.tanggal === t && o.status !== 'Batal').sort((a, b) => (a.jam || '99').localeCompare(b.jam || '99'));
  const up = unpaid(d);
  const low = d.stok.filter(isLow);
  const recs = absToday(d), kar = activeKar(d);
  const hadir = kar.filter(k => recs[k.id]?.status === 'Hadir').length;
  const resched = d.orders.filter(o => o.status === 'Jadwal ulang');

  const attention: { k: string; t: string; m: string; go: Tab }[] = [
    ...dueNotes(d).map(n => ({ k: n.tanggal < t ? 'bad' : 'warn', t: `${n.tanggal < t ? 'Terlambat' : 'Hari ini'}: ${n.judul}`, m: n.tipe, go: 'catatan' as Tab })),
    ...resched.map(o => ({ k: 'warn', t: `Jadwal ulang: ${o.pelanggan}`, m: `${o.layanan} · semula ${fmtD(o.tanggal)}`, go: 'order' as Tab })),
    ...low.map(s => ({ k: (+s.qty || 0) <= 0 ? 'bad' : 'warn', t: `Stok ${(+s.qty || 0) <= 0 ? 'habis' : 'menipis'}: ${s.nama}`, m: `Sisa ${+s.qty || 0} ${s.satuan || ''} · minimum ${+s.min || 0}`, go: 'stok' as Tab })),
  ];

  const svcCount: Record<string, number> = {};
  omMonth.forEach(o => (svcCount[o.layanan] = (svcCount[o.layanan] || 0) + (+o.qtyUnit || 1)));
  const svcTop = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <div className="section-head">
        <div><h2>Ringkasan hari ini</h2>{owner && <p>Omzet dihitung dari order berstatus Selesai.</p>}</div>
        <div className="actions">
          <Button onClick={() => open({ kind: 'order' })}>+ Order baru</Button>
          <Button variant="outline" onClick={() => open({ kind: 'note' })}>+ Catatan</Button>
        </div>
      </div>
      <div className="kpis">
        {owner && <Kpi lab="Omzet hari ini" val={rp(sum(omToday))} note={`${omToday.length} order selesai`} />}
        {owner && <Kpi lab="Omzet bulan ini" val={rp(sum(omMonth))} note={`${omMonth.length} order selesai`} />}
        <Kpi lab="Jadwal hari ini" val={jobsToday.length} note={`${jobsToday.filter(o => o.status === 'Selesai').length} sudah selesai`} />
        <Kpi lab="Belum dibayar" val={rp(sum(up))} note={`${up.length} invoice`} alert={up.length > 0} />
        <Kpi lab="Stok menipis" val={low.length} note={low.length ? 'perlu belanja' : 'stok aman'} alert={low.length > 0} />
        <Kpi lab="Hadir hari ini" val={`${hadir}/${kar.length}`} note={kar.length ? 'karyawan aktif' : 'belum ada karyawan'} />
      </div>
      <div className="cols">
        <div className="stack">
          <div className="panel">
            <h3>Jadwal kunjungan hari ini <button className="linkbtn" onClick={() => go('order')}>Semua order</button></h3>
            {jobsToday.length ? (
              <ul className="list">
                {jobsToday.map(o => (
                  <li key={o.id}>
                    <span className="time">{o.jam || '—'}</span>
                    <div className="main">
                      <b>{o.pelanggan}</b> · {o.layanan}{o.qtyUnit > 1 ? ` (${o.qtyUnit} unit)` : ''}
                      <div className="meta">{o.alamat}{o.teknisi ? ' · Teknisi: ' + karName(d, o.teknisi) : ''}</div>
                    </div>
                    <span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty"><b>Belum ada jadwal hari ini</b>Tambahkan order baru dari tombol di atas.</div>
            )}
          </div>
          {owner && <div className="panel chart"><h3>Omzet 14 hari terakhir</h3><Chart14 d={d} /></div>}
        </div>
        <div className="stack">
          <div className="panel">
            <h3>Perlu perhatian</h3>
            {attention.length ? (
              <ul className="list">
                {attention.slice(0, 12).map((x, i) => (
                  <li key={i}>
                    <span className={`pill ${x.k}`}>!</span>
                    <div className="main"><b>{x.t}</b><div className="meta">{x.m}</div></div>
                    <button className="linkbtn" onClick={() => go(x.go)}>Buka</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty"><b>Semua aman</b>Tidak ada stok menipis, pengingat jatuh tempo, atau jadwal ulang.</div>
            )}
          </div>
          <div className="panel">
            <h3>Layanan terbanyak bulan ini</h3>
            {svcTop.length ? (
              <ul className="list">
                {svcTop.map(([n, c]) => (<li key={n}><div className="main"><b>{n}</b></div><span className="num">{c} unit</span></li>))}
              </ul>
            ) : (
              <div className="empty">Belum ada order selesai bulan ini.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Chart14({ d }: { d: AllData }) {
  const t = d.today;
  const days = [...Array(14)].map((_, i) => addDays(t, i - 13));
  const om = omzetOrders(d);
  const sums = days.map(day => om.filter(o => o.tanggal === day).reduce((a, o) => a + (+o.total || 0), 0));
  const max = Math.max(...sums, 0);
  const step = max <= 0 ? 100000 : Math.pow(10, Math.floor(Math.log10(max / 3)));
  const nice = [1, 2, 5, 10].map(x => x * step).find(s => s * 3 >= max) || step * 10;
  const top = nice * 3, W = 560, H = 200, L = 44, B = 24, T = 10, cw = (W - L - 6) / 14;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik omzet 14 hari">
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <line className="grid" x1={L} x2={W - 4} y1={y(nice * i)} y2={y(nice * i)} />
          <text x={L - 6} y={y(nice * i) + 3} textAnchor="end">{short(nice * i)}</text>
        </g>
      ))}
      {days.map((day, i) => {
        const h = Math.max(sums[i] > 0 ? 2 : 0, H - T - B - (y(sums[i]) - T));
        const x = L + i * cw + cw * 0.18;
        return (
          <g key={day}>
            <rect className={`bar${day === t ? ' today' : ''}`} x={x} y={H - B - h} width={cw * 0.64} height={h} rx={2}>
              <title>{`${fmtD(day)}: ${rp(sums[i])}`}</title>
            </rect>
            <text x={x + cw * 0.32} y={H - 8} textAnchor="middle">{+day.slice(8)}</text>
          </g>
        );
      })}
    </svg>
  );
}
