/* Kop halaman publik (scan stiker, form daftar): logo GT + "CV. Glory Teknik (Aliang AC)" + tagline. */
import { MEREK, MEREK_ALIAS, TAGLINE } from '@/lib/brand';

export function KopPublik() {
  return (
    <header style={{
      position: 'relative', overflow: 'hidden', color: '#fff', borderRadius: 18, padding: '20px 18px 22px', marginBottom: 16,
      background: 'linear-gradient(135deg, #123a9c 0%, #1d4fc4 60%, #2a66e0 100%)', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: '0 3px 10px rgb(0 0 0 / .25)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Logo GT" width={50} height={50} />
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2 }}>{MEREK}<span style={{ display: 'block', color: '#ffd1b3', fontSize: '.95rem' }}>({MEREK_ALIAS})</span></div>
        <div style={{ display: 'inline-block', marginTop: 6, background: 'rgb(255 255 255 / .18)', borderRadius: 999, padding: '2px 10px', fontSize: '.8rem', fontWeight: 800 }}>{TAGLINE}</div>
      </div>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: 'linear-gradient(90deg, #e8382b, #f47a20)' }} />
    </header>
  );
}
