'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { aturRute, jadwalUlang, laporKendala, savePesanCepat, simpanTim, tandaBisaBantu } from '@/app/actions';
import { activeKar, STATUS_CLS } from '@/lib/derive';
import { addDays, fmtD, fmtLong, waNumber } from '@/lib/format';
import { ringkasItems } from '@/lib/order';
import { ALASAN_KENDALA, anggotaTim, isiPesanCepat, namaTim, PESAN_CEPAT, ruteTim, timSaya, urutTim, type Tim } from '@/lib/tim';
import { posisiKaryawan, type AllData, type Order } from '@/lib/types';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { mapsUrl } from './order';

const timHari = (d: AllData, tgl: string) => d.tim.find(h => h.id === tgl);

/* Papan rute (admin): satu kolom per tim, nomor rute, pindah antar tim, kendala & tim yang siap bantu. */
export function PapanRute() {
  const { d, open, run } = useDash();
  const [tgl, setTgl] = useState(d.today);
  const hari = timHari(d, tgl);
  const tim = urutTim(hari?.tim || [], d.karyawan);
  const tanpaTim = d.orders.filter(o => o.tanggal === tgl && !o.jual && o.status !== 'Batal' && !(o.timId && tim.some(t => t.id === o.timId)))
    .sort((a, b) => (a.jam || '99').localeCompare(b.jam || '99'));
  const kolom: { id: string; judul: string; t?: Tim; list: Order[] }[] = [
    ...tim.map(t => ({ id: t.id, judul: namaTim(t, d.karyawan), t, list: ruteTim(d.orders, tgl, t.id) })),
    ...(tanpaTim.length || !tim.length ? [{ id: '', judul: 'Belum ada tim', list: tanpaTim }] : []),
  ];
  const nama = (id: string) => d.karyawan.find(k => k.id === id)?.nama || '?';
  const pindah = (o: Order, ke: string) => {
    if (ke === '__besok') return run(jadwalUlang(o.id, addDays(o.tanggal, 1)), `${o.pelanggan}: dijadwal ulang besok`);
    const n = ruteTim(d.orders, tgl, ke).length;
    return run(aturRute(o.id, ke, n), `${o.pelanggan} → ${ke ? namaTim({ ketua: ke }, d.karyawan) : 'tanpa tim'}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="seg">
          <button aria-pressed={tgl === addDays(d.today, -1)} onClick={() => setTgl(addDays(d.today, -1))}>Kemarin</button>
          <button aria-pressed={tgl === d.today} onClick={() => setTgl(d.today)}>Hari ini</button>
          <button aria-pressed={tgl === addDays(d.today, 1)} onClick={() => setTgl(addDays(d.today, 1))}>Besok</button>
        </div>
        <input type="date" className="field" style={{ width: 'auto' }} value={tgl} onChange={e => e.target.value && setTgl(e.target.value)} aria-label="Tanggal" />
        <Button onClick={() => open({ kind: 'aturTim', tanggal: tgl })}>⚙ Atur tim</Button>
        <Button variant="outline" onClick={() => open({ kind: 'order', tanggal: tgl })}>+ Tambah rute</Button>
        <Button variant="ghost" onClick={() => open({ kind: 'pesanCepat' })}>✏️ Pesan cepat WA</Button>
      </div>
      <p className="hint" style={{ margin: 0 }}>{fmtLong(tgl)} · {tim.length} tim · {kolom.reduce((a, k) => a + k.list.length, 0)} rute{!tim.length && ' — belum ada tim: klik “Atur tim” (bisa salin dari kemarin).'}</p>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(260px, 1fr)', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {kolom.map(k => {
          const selesai = k.list.filter(o => o.status === 'Selesai').length;
          return (
            <div key={k.id || 'tanpa'} className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <div><b>{k.judul}</b>{k.t && <div className="sm">{nama(k.t.ketua)} (teknisi){k.t.anggota.length ? ' · ' + k.t.anggota.map(nama).join(', ') : ''}</div>}</div>
                {k.list.length > 0 && <span className={`pill ${selesai === k.list.length ? 'good' : ''}`}>{selesai}/{k.list.length} selesai</span>}
              </div>
              {k.t?.bisaBantu && <span className="pill good" style={{ alignSelf: 'flex-start' }}>✋ Siap bantu rute lain</span>}
              {k.list.map((o, i) => (
                <div key={o.id} className="panel" style={{ padding: '8px 10px', background: o.kendala ? 'var(--bad-soft)' : 'var(--sunk)', borderColor: o.kendala ? 'var(--bad)' : undefined }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {k.id && <b className="num" style={{ color: 'var(--brand)' }}>{i + 1}</b>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button className="linkbtn" style={{ color: 'var(--ink)', textAlign: 'left' }} onClick={() => open({ kind: 'order', id: o.id })}><b>{o.pelanggan}</b></button>
                      <div className="sm">{ringkasItems(o.items)}{o.jam ? ` · ${o.jam}` : ''}</div>
                      {o.alamat && <div className="sm">{o.alamat}</div>}
                      {o.kendala && <div className="sm" style={{ color: 'var(--bad)', fontWeight: 600 }}>⚠ Kendala: {o.kendala.alasan} ({o.kendala.oleh})</div>}
                      {!!o.pindah?.length && <div className="sm">↪ {o.pindah[o.pindah.length - 1].dari} → {o.pindah[o.pindah.length - 1].ke}</div>}
                    </div>
                    <span className={`pill ${STATUS_CLS[o.status] || ''}`} style={{ alignSelf: 'flex-start' }}>{o.status}</span>
                  </div>
                  <div className="actions" style={{ marginTop: 6, gap: 4 }}>
                    {k.id && <Button size="xs" variant="ghost" disabled={i === 0} aria-label="Naikkan" onClick={() => run(aturRute(o.id, k.id, i - 1))}>▲</Button>}
                    {k.id && <Button size="xs" variant="ghost" disabled={i === k.list.length - 1} aria-label="Turunkan" onClick={() => run(aturRute(o.id, k.id, i + 1))}>▼</Button>}
                    <select className="field" style={{ width: 'auto', padding: '2px 6px', fontSize: '.78rem' }} value="" onChange={e => e.target.value !== '' && pindah(o, e.target.value === '__tanpa' ? '' : e.target.value)} aria-label="Pindahkan">
                      <option value="">{k.id ? 'Pindah ke…' : 'Masukkan ke tim…'}</option>
                      {tim.filter(t => t.id !== k.id).map(t => <option key={t.id} value={t.id}>{namaTim(t, d.karyawan)}{t.bisaBantu ? ' ✋' : ''} · {ruteTim(d.orders, tgl, t.id).filter(x => x.status !== 'Selesai').length} tersisa</option>)}
                      {k.id && <option value="__tanpa">Lepas dari tim</option>}
                      <option value="__besok">Jadwal ulang besok</option>
                    </select>
                  </div>
                </div>
              ))}
              {!k.list.length && <div className="empty" style={{ padding: 8 }}>Belum ada rute.</div>}
              {k.id && <Button size="sm" variant="ghost" onClick={() => open({ kind: 'order', tanggal: tgl, timId: k.id })}>+ Rute untuk {k.judul}</Button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Atur tim satu tanggal: ketua (teknisi / helper yang bisa jadi ketua) + 1–2 helper. */
export function AturTimDialog({ tanggal, onClose }: { tanggal: string; onClose: () => void }) {
  const { d, run } = useDash();
  const kar = activeKar(d).filter(k => posisiKaryawan(k) !== 'admin');
  const calonKetua = kar.filter(k => posisiKaryawan(k) === 'teknisi' || k.bisaKetua);
  const awal = timHari(d, tanggal)?.tim;
  const [tim, setTim] = useState<Tim[]>(() => urutTim(awal || [], d.karyawan));
  const dipakai = (kecuali: string) => new Set(tim.filter(t => t.id !== kecuali).flatMap(anggotaTim));
  const salin = () => {
    const kemarin = timHari(d, addDays(tanggal, -1))?.tim;
    if (!kemarin?.length) return toast.error('Kemarin belum ada susunan tim.');
    setTim(urutTim(kemarin.map(t => ({ ...t, bisaBantu: false })), d.karyawan));
  };
  const set = (i: number, patch: Partial<Tim>) => setTim(ts => ts.map((t, j) => (j === i ? { ...t, ...patch, id: patch.ketua ?? t.ketua } : t)));
  return (
    <FormDialog title={`Atur tim · ${fmtLong(tanggal)}`} onClose={onClose} submitLabel="Simpan tim"
      onSubmit={() => (tim.some(t => !t.ketua) ? (toast.error('Pilih teknisi untuk setiap tim.'), Promise.resolve(false)) : run(simpanTim(tanggal, tim), 'Susunan tim disimpan'))}>
      <div className="actions"><Button type="button" size="sm" variant="outline" onClick={salin}>⟳ Salin tim kemarin</Button><span className="hint">Urutan tim mengikuti urutan teknisi di data karyawan.</span></div>
      {tim.map((t, i) => {
        const pakai = dipakai(t.id);
        return (
          <fieldset key={i} className="box">
            <legend>{t.ketua ? namaTim(t, d.karyawan) : `Tim ${i + 1}`}</legend>
            <label className="lbl">Teknisi
              <select className="field" value={t.ketua} onChange={e => set(i, { ketua: e.target.value, anggota: t.anggota.filter(a => a !== e.target.value) })}>
                <option value="">Pilih…</option>
                {calonKetua.filter(k => !pakai.has(k.id) || k.id === t.ketua).map(k => <option key={k.id} value={k.id}>{k.nama}{posisiKaryawan(k) === 'helper' ? ' (teknisi pengganti)' : ''}</option>)}
              </select>
            </label>
            <div className="lbl">Anggota (helper)
              <div className="actions" style={{ marginTop: 4 }}>
                {kar.filter(k => k.id !== t.ketua && (!pakai.has(k.id) || t.anggota.includes(k.id))).map(k => (
                  <label key={k.id} className="pill" style={{ cursor: 'pointer', padding: '4px 10px' }}>
                    <input type="checkbox" checked={t.anggota.includes(k.id)} style={{ marginRight: 6 }}
                      onChange={e => set(i, { anggota: e.target.checked ? [...t.anggota, k.id] : t.anggota.filter(a => a !== k.id) })} />{k.nama}
                  </label>
                ))}
              </div>
            </div>
            <div><Button type="button" size="xs" variant="ghost" onClick={() => setTim(ts => ts.filter((_, j) => j !== i))}>Hapus tim ini</Button></div>
          </fieldset>
        );
      })}
      <div><Button type="button" size="sm" variant="outline" onClick={() => setTim(ts => [...ts, { id: '', ketua: '', anggota: [] }])}>+ Tim</Button></div>
      {!calonKetua.length && <p className="hint">Belum ada karyawan berposisi Teknisi. Atur posisi di Absensi → Data karyawan.</p>}
    </FormDialog>
  );
}

/* Admin mengatur kalimat pesan cepat WA yang dipakai teknisi ke konsumen */
export function PesanCepatDialog({ onClose }: { onClose: () => void }) {
  const { d, run } = useDash();
  const [list, setList] = useState(() => (d.settings.pesanCepat?.length ? d.settings.pesanCepat : PESAN_CEPAT).map(x => ({ ...x })));
  const set = (i: number, patch: Partial<{ judul: string; teks: string }>) => setList(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <FormDialog title="Pesan cepat WA teknisi" onClose={onClose} submitLabel="Simpan" onSubmit={() => run(savePesanCepat(list), 'Pesan cepat disimpan')}>
      <p className="hint" style={{ margin: 0 }}>Dipakai teknisi untuk konfirmasi ke konsumen. Kode isian: <span className="mono">{'{nama}'}</span> nama konsumen, <span className="mono">{'{teknisi}'}</span> nama teknisi (otomatis “bang …”), <span className="mono">{'{pekerjaan}'}</span> pekerjaan.</p>
      {list.map((x, i) => (
        <fieldset key={i} className="box">
          <legend>Pesan {i + 1}</legend>
          <input className="field" value={x.judul} onChange={e => set(i, { judul: e.target.value })} placeholder="Judul tombol, mis. Menuju lokasi" />
          <textarea className="field" value={x.teks} onChange={e => set(i, { teks: e.target.value })} style={{ minHeight: 70 }} />
          <div><Button type="button" size="xs" variant="ghost" onClick={() => setList(l => l.filter((_, j) => j !== i))}>Hapus</Button></div>
        </fieldset>
      ))}
      <div className="actions">
        <Button type="button" size="sm" variant="outline" disabled={list.length >= 8} onClick={() => setList(l => [...l, { judul: '', teks: '' }])}>+ Pesan</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setList(PESAN_CEPAT.map(x => ({ ...x })))}>Kembalikan pesan awal</Button>
      </div>
    </FormDialog>
  );
}

/* Tampilan HP teknisi / helper: sapaan, tim hari ini, rute berurutan, WA konsumen (khusus ketua), kendala & siap bantu. */
export function RuteSaya() {
  const { d, open, run } = useDash();
  const kid = d.me.karyawanId;
  const saya = d.karyawan.find(k => k.id === kid);
  const hari = timHari(d, d.today);
  const { tim, ketua } = timSaya(hari, kid);
  const bolehWa = ketua || (!tim && saya && posisiKaryawan(saya) === 'teknisi');
  const milik = (o: Order) => !!kid && o.teknisi.includes(kid);
  const hariIni = d.orders.filter(o => milik(o) && o.tanggal === d.today && o.status !== 'Batal' && !o.jual)
    .sort((a, b) => (a.rute || 999) - (b.rute || 999) || (a.jam || '99').localeCompare(b.jam || '99'));
  const lain = d.orders.filter(o => milik(o) && o.tanggal !== d.today && o.status !== 'Batal' && !o.jual && o.tanggal >= addDays(d.today, -3))
    .sort((a, b) => (a.tanggal + (a.jam || '99')).localeCompare(b.tanggal + (b.jam || '99')));
  const pesan = d.settings.pesanCepat?.length ? d.settings.pesanCepat : PESAN_CEPAT;
  const [kendalaUntuk, setKendalaUntuk] = useState<string | null>(null);
  const panggil = saya ? `bang ${saya.nama}` : 'tim kami';
  const selesai = hariIni.filter(o => o.status === 'Selesai').length;

  return (
    <>
      <div className="panel" style={{ background: 'linear-gradient(135deg, #123a9c, #1d4fc4)', color: '#fff', border: 0, marginBottom: 14 }}>
        <b style={{ fontSize: '1.15rem' }}>Halo bang {saya?.nama || d.me.nama} 👋</b>
        <div style={{ opacity: .9, fontSize: '.85rem', marginTop: 2 }}>
          {saya ? (tim ? `${ketua ? 'Teknisi' : 'Helper'} · ${namaTim(tim, d.karyawan)}${anggotaTim(tim).length > 1 ? ' (bersama ' + anggotaTim(tim).filter(x => x !== kid).map(x => d.karyawan.find(k => k.id === x)?.nama || '').join(', ') + ')' : ''}` : 'Belum masuk tim hari ini') : ''}
        </div>
        <div style={{ fontWeight: 700, marginTop: 6 }}>Rute hari ini: {hariIni.length} · selesai {selesai}</div>
      </div>
      {(d.pendataan || []).map(x => (
        <a key={x.id} href={`/pendataan?p=${x.id}`} className="panel" style={{ display: 'block', marginBottom: 14, fontWeight: 700, color: '#1d4fc4' }}>📋 Pendataan AC · {x.nama} →</a>
      ))}
      {tim && (
        <div className="actions" style={{ marginBottom: 12 }}>
          <Button variant={tim.bisaBantu ? 'default' : 'outline'} onClick={() => run(tandaBisaBantu(d.today, !tim.bisaBantu), tim.bisaBantu ? 'Tanda siap bantu dihapus' : 'Admin diberi tahu tim Anda siap bantu')}>
            ✋ {tim.bisaBantu ? 'Tim kami siap bantu (aktif)' : 'Tim kami bisa bantu rute lain'}
          </Button>
        </div>
      )}
      {hariIni.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hariIni.map((o, i) => {
            const wa = waNumber(o.hp);
            const isi = (teks: string) => isiPesanCepat(teks, { nama: o.pelanggan, teknisi: panggil, pekerjaan: ringkasItems(o.items) });
            return (
              <div key={o.id} className="panel" style={{ padding: 12, borderColor: o.kendala ? 'var(--bad)' : undefined, background: o.kendala ? 'var(--bad-soft)' : undefined }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <b className="num" style={{ color: 'var(--brand)', fontSize: '1.1rem' }}>{o.rute || i + 1}</b>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{o.pelanggan}</b>
                    {o.items.map((it, n) => <div key={n} className="sm">• {it.layanan}{it.qty > 1 ? ` ×${it.qty}` : ''}{it.unit ? ` — ${it.unit}` : ''}</div>)}
                    <div className="sm">{o.alamat}{o.jam ? ` · ${o.jam}` : ''}</div>
                    {o.ket && <div className="sm">Catatan: {o.ket}</div>}
                    {o.kendala && <div className="sm" style={{ color: 'var(--bad)', fontWeight: 600 }}>⚠ Kendala dilaporkan: {o.kendala.alasan} — menunggu admin</div>}
                  </div>
                  <span className={`pill ${STATUS_CLS[o.status] || ''}`} style={{ alignSelf: 'flex-start' }}>{o.status}</span>
                </div>
                <div className="actions" style={{ marginTop: 8 }}>
                  <Button size="sm" onClick={() => open({ kind: 'tugas', id: o.id })}>Buka tugas</Button>
                  {o.alamat && <Button size="sm" variant="outline" nativeButton={false} render={<a href={mapsUrl(o.alamat)} target="_blank" rel="noopener noreferrer" />}>📍 Maps</Button>}
                  {bolehWa && wa && o.status !== 'Selesai' && pesan.map(p => (
                    <Button key={p.judul} size="sm" variant="outline" nativeButton={false} render={<a href={`https://wa.me/${wa}?text=${encodeURIComponent(isi(p.teks))}`} target="_blank" rel="noopener noreferrer" />}>💬 {p.judul}</Button>
                  ))}
                  {bolehWa && wa && <Button size="sm" variant="ghost" nativeButton={false} render={<a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" />}>WA</Button>}
                  {o.status !== 'Selesai' && (o.kendala
                    ? <Button size="sm" variant="ghost" onClick={() => run(laporKendala(o.id, ''), 'Laporan kendala dibatalkan')}>Batalkan laporan kendala</Button>
                    : <Button size="sm" variant="outline" style={{ color: 'var(--bad)' }} onClick={() => setKendalaUntuk(kendalaUntuk === o.id ? null : o.id)}>⚠ Ada kendala</Button>)}
                </div>
                {kendalaUntuk === o.id && (
                  <div className="actions" style={{ marginTop: 8 }}>
                    <span className="sm">Pilih alasan:</span>
                    {ALASAN_KENDALA.map(a => <Button key={a} size="xs" variant="outline" onClick={async () => { if (await run(laporKendala(o.id, a), 'Kendala dilaporkan ke admin')) setKendalaUntuk(null); }}>{a}</Button>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <div className="panel empty"><b>Belum ada rute hari ini</b>Rute dari admin akan muncul di sini.</div>}
      {lain.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Jadwal lain</h3>
          <ul className="list">
            {lain.map(o => (
              <li key={o.id} style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'tugas', id: o.id })}>
                <span className="time">{fmtD(o.tanggal)}</span>
                <div className="main"><b>{o.pelanggan}</b><div className="meta">{ringkasItems(o.items)}</div></div>
                <span className={`pill ${STATUS_CLS[o.status] || ''}`}>{o.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
