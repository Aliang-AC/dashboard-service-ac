'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';

/* Default: login karyawan (nomor HP + PIN) — tombol Google & link daftar disembunyikan,
   karena akun karyawan dibuat oleh admin/pemilik. ?pemilik=1 → tampilkan login Google untuk pemilik. */
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
  const hide = { display: 'none' };
  return (
    <div className="flex flex-col items-center gap-3">
      <SignIn
        forceRedirectUrl={redirect || undefined}
        appearance={{
          elements: pemilik
            ? { footerAction: hide }
            : { socialButtonsRoot: hide, dividerRow: hide, footerAction: hide },
        }}
      />
      {pemilik
        ? <Link className="linkbtn" href={keep('')}>← Masuk sebagai karyawan (nomor HP)</Link>
        : <Link className="linkbtn" href={keep('pemilik=1')}>Masuk sebagai pemilik (Google)</Link>}
      {!pemilik && <p className="hint" style={{ textAlign: 'center', maxWidth: 360 }}>Belum punya akun? Minta admin membuatkan akun dengan nomor HP Anda.</p>}
    </div>
  );
}
