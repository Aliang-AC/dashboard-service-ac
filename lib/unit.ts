/* Aturan unit AC & stiker QR — dipakai server & browser (tanpa dependensi). */
import type { UnitAC } from './types';

export const POLA_KODE = /^GT-\d{4,}$/;
export const kodeStiker = (n: number) => 'GT-' + String(n).padStart(4, '0');

/* ambil kode dari hasil scan QR (URL …/u/GT-0015) atau ketikan ("gt 15", "GT-0015") */
export function kodeDariTeks(teks: string) {
  const t = String(teks || '').toUpperCase();
  const m = t.match(/GT[-\s]?(\d{1,6})/);
  return m ? kodeStiker(+m[1]) : '';
}

const fmtPk = (pk?: string) => (pk ? (/pk/i.test(pk) ? pk : pk + ' PK') : '');
/* "Gedung Laboratorium · Ruang Immunologi · AC no. 105" */
export const lokasiUnit = (u: Pick<UnitAC, 'gedung' | 'label' | 'noAc'>) =>
  [u.gedung, u.label, u.noAc && 'AC no. ' + u.noAc].filter(Boolean).join(' · ');
/* "Daikin 2 PK Split · R32" */
export const specUnit = (u: Pick<UnitAC, 'merk' | 'pk' | 'tipe' | 'freon'>) =>
  [[u.merk, fmtPk(u.pk), u.tipe].filter(Boolean).join(' '), u.freon].filter(Boolean).join(' · ');

/* Nama gedung disamakan sebelum dibandingkan: "Gdg. Lab" ~ "Gedung Laboratorium" */
const normGedung = (s: string) => s.toLowerCase().replace(/\b(gedung|gdg|ged)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
export function gedungMirip(nama: string, daftar: string[]) {
  const n = normGedung(nama);
  if (!n) return '';
  return daftar.find(g => { const x = normGedung(g); return x && x !== n && (x.startsWith(n) || n.startsWith(x)); }) || '';
}
export const gedungSama = (a: string, b: string) => normGedung(a) === normGedung(b);

/* pesan WA otomatis dari halaman scan stiker (bisa diubah pemilik/admin di Pengaturan) */
export const TEMPLATE_SCAN = 'Halo Aliang AC, saya mau servis AC di {lokasi} (kode {kode}).';
export const isiTemplateScan = (t: string, u: Pick<UnitAC, 'kode' | 'label' | 'gedung' | 'noAc' | 'merk' | 'pk' | 'tipe' | 'freon'>) =>
  (t || TEMPLATE_SCAN)
    .replace(/\{kode\}/g, u.kode || '')
    .replace(/\{lokasi\}/g, lokasiUnit(u) || 'AC saya')
    .replace(/\{ruangan\}/g, u.label || '')
    .replace(/\{gedung\}/g, u.gedung || '')
    .replace(/\{merk\}/g, specUnit({ merk: u.merk, pk: u.pk }) || 'AC');
