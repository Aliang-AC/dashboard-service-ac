import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { Button } from '@/components/ui/button';
import { FormKeluhan } from '@/components/publik/form-keluhan';
import { KopPublik } from '@/components/publik/kop-publik';
import { MEREK_ALIAS, MEREK_LENGKAP, WA_USAHA, WA_USAHA_TAMPIL } from '@/lib/brand';
import { adminDb } from '@/lib/firebase-admin';
import { fmtLong, todayWIB } from '@/lib/format';
import { normOrder } from '@/lib/order';
import { jadwalUnit } from '@/lib/servis';
import type { Pelanggan, Stiker, UnitAC } from '@/lib/types';
import { isiTemplateScan, kodeDariTeks, POLA_KODE, seriKode, specUnit } from '@/lib/unit';

export const metadata: Metadata = { title: `Jadwal servis AC · ${MEREK_LENGKAP}` };

/* Halaman publik saat stiker QR di-scan. Sengaja TIDAK menampilkan nama/alamat konsumen. */
export default function Page({ params }: PageProps<'/u/[kode]'>) {
  return (
    <main className="wrap" style={{ maxWidth: 480, paddingTop: 16, paddingBottom: 40 }}>
      <KopPublik />
      <Suspense fallback={<div className="empty">Memuat…</div>}><Isi params={params} /></Suspense>
    </main>
  );
}

const waLink = (pesan?: string) => `https://wa.me/${WA_USAHA}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}`;

function Kaki({ kode }: { kode: string }) {
  return (
    <p style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--ink-2)', marginTop: 14, lineHeight: 1.6 }}>
      WA : {WA_USAHA_TAMPIL} (Admin)<br /><span className="mono" style={{ fontSize: '.68rem', opacity: .6 }}>{kode}</span>
    </p>
  );
}

function Pesan({ judul, isi, kode, pesan }: { judul: string; isi: string; kode: string; pesan: string }) {
  return (
    <>
      <div className="panel" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, padding: 20 }}>
        <h3 className="justify-center" style={{ margin: 0 }}>{judul}</h3>
        <p className="muted" style={{ margin: 0 }}>{isi}</p>
        <Button size="lg" nativeButton={false} render={<a href={waLink(pesan)} target="_blank" rel="noopener noreferrer" />} style={{ background: '#1fa855' }}>💬 Chat {MEREK_ALIAS}</Button>
      </div>
      <Kaki kode={kode} />
    </>
  );
}

async function Isi({ params }: { params: PageProps<'/u/[kode]'>['params'] }) {
  await connection(); // selalu dibaca saat diminta (data jadwal terbaru)
  const kode = kodeDariTeks(decodeURIComponent((await params).kode));
  if (!POLA_KODE.test(kode)) return <Pesan judul="Kode stiker tidak dikenal" isi="Silakan hubungi kami untuk bantuan servis AC." kode="" pesan={`Halo ${MEREK_ALIAS}, saya mau tanya servis AC.`} />;
  const db = adminDb();
  const [stSnap, setSnap] = await Promise.all([db.doc('stiker/' + kode).get(), db.doc('settings/usaha').get()]);
  const st = stSnap.exists ? (stSnap.data() as Stiker) : null;

  /* stiker baru (belum dipasang) / sudah diganti */
  if (st?.status === 'kosong')
    return <Pesan judul="Stiker belum aktif" isi="Stiker ini belum terhubung ke unit AC. Hubungi kami untuk servis AC Anda." kode={kode} pesan={`Halo ${MEREK_ALIAS}, saya mau servis AC (stiker ${kode}).`} />;
  if (st?.status === 'diganti')
    return <Pesan judul="Stiker sudah tidak berlaku" isi="Stiker ini sudah diganti dengan stiker baru. Hubungi kami bila perlu bantuan." kode={kode} pesan={`Halo ${MEREK_ALIAS}, saya mau servis AC (stiker lama ${kode}).`} />;

  /* cari unitnya: lewat data stiker, atau (data lama) lewat kode di pelanggan */
  let p: Pelanggan | null = null;
  if (st?.pelangganId) {
    const s = await db.doc('pelanggan/' + st.pelangganId).get();
    p = s.exists ? ({ id: s.id, ...s.data() } as Pelanggan) : null;
  } else {
    const q = await db.collection('pelanggan').where('unitKodes', 'array-contains', kode).limit(1).get();
    p = q.empty ? null : ({ id: q.docs[0].id, ...q.docs[0].data() } as Pelanggan);
  }
  const u: UnitAC | undefined = p?.units?.find(x => (st?.unitId ? x.id === st.unitId : x.kode === kode));
  if (!p || !u) return <Pesan judul="Kode unit tidak ditemukan" isi="Silakan hubungi kami untuk bantuan servis AC." kode={kode} pesan={`Halo ${MEREK_ALIAS}, saya mau servis AC (kode ${kode}).`} />;

  /* stiker khusus instansi (mis. RSUD-0001): nama instansi tampil & ikut di pesan WA */
  const inst = p.stikerSeri && seriKode(kode) === p.stikerSeri ? p.stikerNama || p.nama : '';
  const pesan = isiTemplateScan(setSnap.get('templateScan') || '', { ...u, kode, gedung: [inst, u.gedung].filter(Boolean).join(' · ') });
  const orders = (await db.collection('orders').where('pelangganId', '==', p.id).get()).docs.map(d => normOrder({ id: d.id, ...d.data() }));
  const j = jadwalUnit(u, orders, p.intervalBulan);
  const today = todayWIB(); // dipakai juga untuk status garansi
  const waktunya = !j.berikut || j.berikut <= today;
  const spec = specUnit(u);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel" style={{ padding: 16 }}>
          {inst && <div style={{ color: '#123a9c', fontWeight: 800, fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: 4 }}>{inst}</div>}
          {u.gedung && <div style={{ color: '#1d4fc4', fontWeight: 700, fontSize: '.85rem' }}>{u.gedung}</div>}
          <div style={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.3 }}>{u.label || 'Unit AC'}</div>
          {u.noAc && <span style={{ display: 'inline-block', marginTop: 4, background: '#eef3ff', color: '#123a9c', fontWeight: 700, fontSize: '.8rem', padding: '2px 8px', borderRadius: 6 }}>AC no. {u.noAc}</span>}
          {spec && <div className="muted" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>{spec}</div>}
          {u.garansi?.sampai && !u.nonaktif && (
            <div style={{ marginTop: 8 }}><span className={`pill ${u.garansi.sampai >= today ? 'good' : ''}`}>{u.garansi.sampai >= today ? `Garansi s/d ${fmtLong(u.garansi.sampai)}` : `Garansi berakhir ${fmtLong(u.garansi.sampai)}`}</span>
              {u.garansi.ket && <div className="sm" style={{ marginTop: 4 }}>{u.garansi.ket}</div>}</div>
          )}
          {u.nonaktif && <div className="pill" style={{ marginTop: 8 }}>Unit ini tercatat tidak aktif</div>}
        </div>
        {!u.nonaktif && (
          <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="grid2">
              <div><div className="sm">Servis terakhir</div><b>{j.terakhir ? fmtLong(j.terakhir) : 'Belum tercatat'}</b>{j.perkiraan && <div className="sm">(perkiraan)</div>}</div>
              <div><div className="sm">Jadwal servis berikutnya</div><b>{j.berikut ? '± ' + fmtLong(j.berikut) : '—'}</b></div>
            </div>
            <div className={`pill ${waktunya ? 'warn' : 'good'}`} style={{ alignSelf: 'flex-start', fontSize: '.85rem', padding: '4px 12px' }}>
              {waktunya ? 'Sudah waktunya dicuci' : `Cuci rutin tiap ${j.interval} bulan`}
            </div>
          </div>
        )}
        <FormKeluhan pesan={pesan} wa={WA_USAHA} label={`${inst ? 'Hubungi' : 'Chat'} ${MEREK_ALIAS}`} />
        <p className="hint" style={{ textAlign: 'center', margin: 0 }}>AC yang rutin dibersihkan lebih dingin, hemat listrik, dan awet.</p>
      </div>
      <Kaki kode={kode} />
    </>
  );
}
