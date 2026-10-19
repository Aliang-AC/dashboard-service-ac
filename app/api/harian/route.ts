import { runBackup } from '@/lib/backup';
import { arsipkan, tandaiAlpa } from '@/lib/absen';
import { addDays, todayWIB } from '@/lib/format';

/* Dipanggil otomatis oleh Vercel Cron (vercel.json) tiap 00:00 WIB, dengan header Authorization: Bearer <CRON_SECRET>.
   Urutan: Alpa otomatis untuk hari kemarin → arsip absensi kemarin ke Drive → backup semua data.
   ?tanggal=YYYY-MM-DD bisa dipakai untuk memproses ulang tanggal tertentu. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('tanggal');
  const tanggal = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : addDays(todayWIB(), -1);
  const out: Record<string, unknown> = { tanggal };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { console.error(name, e); out[name] = { error: e instanceof Error ? e.message : String(e) }; }
  };
  await step('alpa', () => tandaiAlpa(tanggal));
  await step('arsip', () => arsipkan(tanggal));
  await step('backup', () => runBackup());
  const ok = !Object.values(out).some(v => typeof v === 'object' && v !== null && 'error' in v);
  return Response.json({ ok, ...out }, { status: ok ? 200 : 500 });
}
