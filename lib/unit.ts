/* Aturan unit AC & stiker QR — dipakai server & browser (tanpa dependensi). */
import type { UnitAC } from './types';

/* Kode stiker = SERI-nomor: GT-0015 (stiker umum) atau seri khusus instansi, mis. RSUD-0001. */
export const POLA_KODE = /^[A-Z]{2,6}-\d{4,}$/;
export const POLA_SERI = /^[A-Z]{2,6}$/;
export const SERI_UMUM = 'GT';
export const kodeStiker = (n: number, seri = SERI_UMUM) => seri + '-' + String(n).padStart(4, '0');
export const seriKode = (kode: string) => kode.split('-')[0] || '';

/* ambil kode dari hasil scan QR (URL …/u/GT-0015) atau ketikan ("gt 15", "GT-0015", "rsud 12") */
export function kodeDariTeks(teks: string) {
  const t = String(teks || '').toUpperCase();
  const m = t.match(/\/U\/([A-Z]{2,6})-(\d{1,6})/) || t.match(/(?:^|[^A-Z])([A-Z]{2,6})[-\s]?(\d{1,6})(?!\d)/);
  return m ? kodeStiker(+m[2], m[1]) : '';
}

const fmtPk = (pk?: string) => (pk ? (/pk/i.test(pk) ? pk : pk + ' PK') : '');
/* "Gedung Laboratorium · Ruang Immunologi · AC no. 105" */
export const lokasiUnit = (u: Pick<UnitAC, 'gedung' | 'label' | 'noAc'>) =>
  [u.gedung, u.label, u.noAc && 'AC no. ' + u.noAc].filter(Boolean).join(' · ');
/* "Daikin 2 PK Split · R32" */
export const specUnit = (u: Pick<UnitAC, 'merk' | 'pk' | 'tipe' | 'freon' | 'inverter'>) =>
  [[u.merk, fmtPk(u.pk), u.tipe, u.inverter && 'Inverter'].filter(Boolean).join(' '), u.freon].filter(Boolean).join(' · ');

/* Nama gedung disamakan sebelum dibandingkan: "Gdg. Lab" ~ "Gedung Laboratorium" */
const normGedung = (s: string) => s.toLowerCase().replace(/\b(gedung|gdg|ged)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
export function gedungMirip(nama: string, daftar: string[]) {
  const n = normGedung(nama);
  if (!n) return '';
  return daftar.find(g => { const x = normGedung(g); return x && x !== n && (x.startsWith(n) || n.startsWith(x)); }) || '';
}
export const gedungSama = (a: string, b: string) => normGedung(a) === normGedung(b);

/* keluhan yang bisa dipilih petugas / konsumen saat scan stiker */
export const KELUHAN_AC = ['Tidak dingin', 'Bocor / netes air', 'Bunyi berisik', 'Bau tidak sedap', 'Mati / tidak menyala', 'Remote rusak', 'Minta jadwal cuci'];
export function pesanKeluhan(pesan: string, keluhan: string[], ket: string, pelapor: string) {
  return [pesan, keluhan.length && 'Keluhan: ' + keluhan.join(', ') + '.', ket.trim() && 'Keterangan: ' + ket.trim(), pelapor.trim() && 'Pelapor: ' + pelapor.trim()]
    .filter(Boolean).join('\n');
}

/* pesan WA otomatis dari halaman scan stiker (bisa diubah pemilik/admin di Pengaturan) */
export const TEMPLATE_SCAN = 'Halo Aliang AC, saya mau servis AC di {lokasi} (kode {kode}).';
export const isiTemplateScan = (t: string, u: Pick<UnitAC, 'kode' | 'label' | 'gedung' | 'noAc' | 'merk' | 'pk' | 'tipe' | 'freon'>) =>
  (t || TEMPLATE_SCAN)
    .replace(/\{kode\}/g, u.kode || '')
    .replace(/\{lokasi\}/g, lokasiUnit(u) || 'AC saya')
    .replace(/\{ruangan\}/g, u.label || '')
    .replace(/\{gedung\}/g, u.gedung || '')
    .replace(/\{merk\}/g, specUnit({ merk: u.merk, pk: u.pk }) || 'AC');
