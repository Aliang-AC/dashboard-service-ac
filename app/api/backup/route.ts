import { runBackup } from '@/lib/backup';

/* Dipanggil otomatis oleh Vercel Cron (lihat vercel.json) tiap tengah malam WIB.
   Vercel mengirim header Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  try {
    const r = await runBackup();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
