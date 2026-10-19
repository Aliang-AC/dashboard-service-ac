/* Jadwal cuci AC per unit — dipakai server & browser (tanpa dependensi). */
import type { Order, Pelanggan, UnitAC } from './types';

export const INTERVAL_DEFAULT = 3; // bulan

export function tambahBulan(tgl: string, n: number) {
  const [y, m, d] = tgl.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const akhir = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, akhir)); // 31 Agu + 3 bln → 30 Nov
  return t.toISOString().slice(0, 10);
}
const geserHari = (tgl: string, n: number) => {
  const t = new Date(tgl + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
};

/* servis terakhir unit = yang terbaru antara isian manual/perkiraan dan order Selesai yang memuat unit itu */
export function jadwalUnit(u: UnitAC, orders: Pick<Order, 'tanggal' | 'status' | 'items'>[], intervalDefault = INTERVAL_DEFAULT) {
  const dariOrder = orders.filter(o => o.status === 'Selesai' && o.items.some(i => i.unitId === u.id)).map(o => o.tanggal).sort().pop() || '';
  const manual = u.servisTerakhir || '';
  const terakhir = dariOrder > manual ? dariOrder : manual;
  const perkiraan = !!manual && manual >= dariOrder && !!u.perkiraan;
  const interval = u.intervalBulan || intervalDefault || INTERVAL_DEFAULT;
  return { terakhir, perkiraan, interval, berikut: terakhir ? tambahBulan(terakhir, interval) : '' };
}

export type UnitJatuhTempo = UnitAC & { terakhir: string; berikut: string; perkiraan: boolean };

/* unit yang perlu dicuci: jadwal berikutnya ≤ 7 hari lagi, atau belum ada data servis sama sekali */
export function unitPerluServis(p: Pelanggan, orders: Pick<Order, 'tanggal' | 'status' | 'items'>[], today: string): UnitJatuhTempo[] {
  const batas = geserHari(today, 7);
  return (p.units || [])
    .map(u => ({ ...u, ...jadwalUnit(u, orders, p.intervalBulan) }))
    .filter(u => !u.berikut || u.berikut <= batas);
}

/* Konsumen masuk daftar "Perlu dihubungi" kalau: izin pengingat tidak dimatikan, tidak sedang ditunda,
   tidak punya jadwal servis ke depan, dan ada unit yang waktunya dicuci. */
export function perluDihubungi(p: Pelanggan, orders: Pick<Order, 'tanggal' | 'status' | 'items' | 'pelangganId'>[], today: string) {
  if (p.izinPengingat === false || !p.units?.length) return null;
  if (p.pengingat?.ulang && p.pengingat.ulang > today) return null;
  if (!p.pengingat && p.diingatkan && p.diingatkan >= geserHari(today, -14)) return null;
  const milik = orders.filter(o => o.pelangganId === p.id);
  if (milik.some(o => o.tanggal >= today && (o.status === 'Terjadwal' || o.status === 'Jadwal ulang'))) return null;
  const units = unitPerluServis(p, milik, today);
  return units.length ? units : null;
}

/* perkiraan tanggal servis terakhir dari jawaban form "kira-kira kapan terakhir dicuci" */
export const PERKIRAAN_TERAKHIR = { '<1': 'Kurang dari 1 bulan', '1-3': '1–3 bulan lalu', '3-6': '3–6 bulan lalu', '>6': 'Lebih dari 6 bulan', lupa: 'Lupa / tidak tahu' } as const;
export function perkiraanTanggal(jawab: string, today: string) {
  const mundur: Record<string, number> = { '<1': -15, '1-3': -60, '3-6': -135, '>6': -210 };
  return jawab in mundur ? geserHari(today, mundur[jawab]) : '';
}

export const labelUnit = (u: Pick<UnitAC, 'label' | 'merk' | 'pk' | 'tipe'>) =>
  [u.label, [u.merk, u.pk && (/pk/i.test(u.pk) ? u.pk : u.pk + ' PK'), u.tipe].filter(Boolean).join(' ')].filter(Boolean).join(' – ');
