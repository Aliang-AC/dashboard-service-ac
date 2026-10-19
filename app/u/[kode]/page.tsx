import { Suspense } from 'react';
import { Logo } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { NAMA_USAHA, WA_USAHA, WA_USAHA_TAMPIL } from '@/lib/brand';
import { adminDb } from '@/lib/firebase-admin';
import { fmtLong, todayWIB } from '@/lib/format';
import { normOrder } from '@/lib/order';
import { jadwalUnit, labelUnit } from '@/lib/servis';
import type { Pelanggan } from '@/lib/types';

/* Halaman publik saat stiker QR di unit AC di-scan. Sengaja TIDAK menampilkan nama/alamat konsumen. */
export default function Page({ params }: PageProps<'/u/[kode]'>) {
  return (
    <main className="wrap" style={{ maxWidth: 480, paddingTop: 28, paddingBottom: 40 }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
        <Logo />
        <div><h1 className="text-2xl leading-none">{NAMA_USAHA}</h1><div className="muted text-sm">Service AC · WA {WA_USAHA_TAMPIL}</div></div>
      </div>
      <Suspense fallback={<div className="empty">Memuat…</div>}><Isi params={params} /></Suspense>
    </main>
  );
}

async function Isi({ params }: { params: PageProps<'/u/[kode]'>['params'] }) {
  const kode = decodeURIComponent((await params).kode).toUpperCase().slice(0, 12);
  const db = adminDb();
  const q = /^GT-\d{4,}$/.test(kode) ? await db.collection('pelanggan').where('unitKodes', 'array-contains', kode).limit(1).get() : null;
  const p = q && !q.empty ? ({ id: q.docs[0].id, ...q.docs[0].data() } as Pelanggan) : null;
  const u = p?.units?.find(x => x.kode === kode);
  if (!p || !u)
    return (
      <div className="panel" style={{ textAlign: 'center' }}>
        <h3 className="justify-center">Kode unit tidak ditemukan</h3>
        <p className="muted">Hubungi kami untuk bantuan servis AC.</p>
        <Button nativeButton={false} render={<a href={`https://wa.me/${WA_USAHA}`} target="_blank" rel="noopener noreferrer" />}>Chat WhatsApp</Button>
      </div>
    );
  const orders = (await db.collection('orders').where('pelangganId', '==', p.id).get()).docs.map(d => normOrder({ id: d.id, ...d.data() }));
  const j = jadwalUnit(u, orders, p.intervalBulan);
  const today = todayWIB();
  const waktunya = !j.berikut || j.berikut <= today;
  const pesan = `Halo ${NAMA_USAHA}, saya mau pesan servis AC untuk unit ${kode} (${labelUnit(u)}).`;
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
      <div>
        <div className="sm">Kode unit</div>
        <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 600 }}>{kode}</div>
      </div>
      <div>
        <div className="sm">Unit AC</div>
        <b style={{ fontSize: '1.1rem' }}>{u.label || 'AC'}</b>
        <div className="muted">{[u.merk, u.pk && (/pk/i.test(u.pk) ? u.pk : u.pk + ' PK'), u.tipe].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      <div className="grid2">
        <div><div className="sm">Servis terakhir</div><b>{j.terakhir ? fmtLong(j.terakhir) : 'Belum tercatat'}</b>{j.perkiraan && <div className="sm">(perkiraan)</div>}</div>
        <div><div className="sm">Jadwal cuci berikutnya</div><b>{j.berikut ? fmtLong(j.berikut) : '—'}</b></div>
      </div>
      <div className={`pill ${waktunya ? 'warn' : 'good'}`} style={{ alignSelf: 'flex-start', fontSize: '.85rem', padding: '4px 12px' }}>
        {waktunya ? 'Sudah waktunya dicuci' : `Cuci rutin tiap ${j.interval} bulan`}
      </div>
      <Button size="lg" nativeButton={false} render={<a href={`https://wa.me/${WA_USAHA}?text=${encodeURIComponent(pesan)}`} target="_blank" rel="noopener noreferrer" />}>
        Pesan servis via WhatsApp
      </Button>
      <p className="hint" style={{ textAlign: 'center' }}>AC yang rutin dibersihkan lebih dingin, hemat listrik, dan awet.</p>
    </div>
  );
}
