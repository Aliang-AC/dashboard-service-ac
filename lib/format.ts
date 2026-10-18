/* Tanggal disimpan sebagai string YYYY-MM-DD waktu WIB; uang sebagai angka Rupiah utuh. */
export const TZ = 'Asia/Jakarta';

export const pad = (n: number) => String(n).padStart(2, '0');
export const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const nowTimeWIB = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const rp = (n: unknown) => 'Rp ' + Math.round(+(n as number) || 0).toLocaleString('id-ID');
export const short = (n: number) => {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return Math.round(n / 1e3) + ' rb';
  return String(n);
};
export const fmtD = (s?: string) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
export const fmtLong = (s?: string) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
export const fmtMonth = (ym: string) =>
  new Date(ym + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
export const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const monthKey = (s?: string) => (s || '').slice(0, 7);

/* 0812-3456 → 628123456 untuk link wa.me */
export const waNumber = (hp?: string) => {
  const d = (hp || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
};
