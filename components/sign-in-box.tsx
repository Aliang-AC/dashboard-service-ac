'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignIn, useSignIn } from '@clerk/nextjs';
import { loginPin } from '@/app/actions';
import { Button } from '@/components/ui/button';

/* Default: login karyawan dengan Nomor HP + PIN (diperiksa server kita → tiket masuk Clerk sekali pakai).
   ?pemilik=1 → login pemilik lewat Google (komponen Clerk biasa). */
export function SignInBox() {
  const sp = useSearchParams();
  const pemilik = sp.get('pemilik') === '1';
  const redirect = sp.get('redirect_url');
  const keep = (extra: string) => {
    const q = new URLSearchParams(extra);
    if (redirect) q.set('redirect_url', redirect);
    const s = q.toString();
    return '/sign-in' + (s ? '?' + s : '');
  };

  if (pemilik)
    return (
      <div className="flex flex-col items-center gap-3">
        <SignIn forceRedirectUrl={redirect || undefined} appearance={{ elements: { footerAction: { display: 'none' } } }} />
        <Link className="linkbtn" href={keep('')}>← Masuk sebagai karyawan (nomor HP)</Link>
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-3">
      <LoginPin redirect={redirect} />
      <Link className="linkbtn" href={keep('pemilik=1')}>Masuk sebagai pemilik (Google)</Link>
    </div>
  );
}

function LoginPin({ redirect }: { redirect: string | null }) {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /* hanya izinkan redirect ke halaman di situs ini */
  const tujuan = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';

  return (
    <form className="panel" style={{ width: 'min(92vw, 380px)', display: 'flex', flexDirection: 'column', gap: 14, padding: 22 }}
      onSubmit={async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true); setErr('');
        const r = await loginPin(String(f.get('hp') || ''), String(f.get('pin') || '')).catch(() => null);
        if (!r || !r.ok) { setErr(r && !r.ok ? r.error : 'Koneksi terputus. Coba lagi.'); setBusy(false); return; }
        const t = await signIn.ticket({ ticket: r.data.ticket });
        if (t.error) { setErr('Login gagal: ' + (t.error.message || 'coba lagi.')); setBusy(false); return; }
        const fin = await signIn.finalize();
        if (fin.error) { setErr('Login gagal: ' + (fin.error.message || 'coba lagi.')); setBusy(false); return; }
        router.replace(tujuan);
        router.refresh();
      }}>
      <div>
        <h3 style={{ margin: 0 }}>Masuk karyawan</h3>
        <p className="hint" style={{ marginTop: 4 }}>Pakai nomor HP dan PIN yang diberikan admin.</p>
      </div>
      <label className="lbl">Nomor HP<input className="field" name="hp" required inputMode="tel" autoComplete="username" placeholder="08xxxxxxxxxx" autoFocus /></label>
      <label className="lbl">PIN<input className="field" name="pin" required type="password" inputMode="numeric" autoComplete="current-password" minLength={6} placeholder="••••••" /></label>
      {err && <p style={{ margin: 0, color: 'var(--bad)', fontWeight: 600 }} role="alert">{err}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</Button>
      <p className="hint" style={{ textAlign: 'center' }}>Belum punya akun atau lupa PIN? Hubungi admin.</p>
    </form>
  );
}
