import { getAccess } from '@/lib/access';
import { adminDb } from '@/lib/firebase-admin';
import { ambilFoto } from '@/lib/drive';

/* Menampilkan foto dari Drive pemilik (lewat skrip Apps Script). Hanya untuk yang login:
   pemilik/admin semua foto; karyawan hanya foto bukti kerja dari order yang ia tangani,
   dan foto name plate unit AC milik konsumen dari order yang ia tangani. */
export async function GET(_req: Request, ctx: RouteContext<'/api/foto/[id]'>) {
  const { id } = await ctx.params;
  const a = await getAccess();
  if (a.kind !== 'ok') return new Response('Unauthorized', { status: 401 });
  const db = adminDb();
  const kid = a.me.karyawanId || '';
  const q = await db.collection('orders').where('fotoIds', 'array-contains', id).limit(1).get();
  if (!q.empty) {
    if (a.me.peran === 'karyawan' && !((q.docs[0].get('teknisi') || []) as string[]).includes(kid)) return new Response('Forbidden', { status: 403 });
  } else {
    const p = await db.collection('pelanggan').where('fotoIds', 'array-contains', id).limit(1).get();
    if (p.empty) return new Response('Not found', { status: 404 });
    if (a.me.peran === 'karyawan') {
      const os = await db.collection('orders').where('pelangganId', '==', p.docs[0].id).get();
      if (!os.docs.some(o => ((o.get('teknisi') || []) as string[]).includes(kid))) return new Response('Forbidden', { status: 403 });
    }
  }
  try {
    const jpeg = await ambilFoto(id);
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' } });
  } catch (e) {
    console.error(e);
    return new Response('Gagal mengambil foto', { status: 502 });
  }
}
