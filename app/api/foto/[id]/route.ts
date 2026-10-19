import { getAccess } from '@/lib/access';
import { adminDb } from '@/lib/firebase-admin';
import { ambilFoto } from '@/lib/drive';

/* Menampilkan foto bukti kerja dari Drive pemilik (lewat skrip Apps Script). Hanya untuk yang login:
   pemilik/admin semua foto; karyawan hanya foto dari order yang ia tangani. */
export async function GET(_req: Request, ctx: RouteContext<'/api/foto/[id]'>) {
  const { id } = await ctx.params;
  const a = await getAccess();
  if (a.kind !== 'ok') return new Response('Unauthorized', { status: 401 });
  const q = await adminDb().collection('orders').where('fotoIds', 'array-contains', id).limit(1).get();
  if (q.empty) return new Response('Not found', { status: 404 });
  if (a.me.peran === 'karyawan' && !((q.docs[0].get('teknisi') || []) as string[]).includes(a.me.karyawanId || '')) return new Response('Forbidden', { status: 403 });
  try {
    const jpeg = await ambilFoto(id);
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' } });
  } catch (e) {
    console.error(e);
    return new Response('Gagal mengambil foto', { status: 502 });
  }
}
