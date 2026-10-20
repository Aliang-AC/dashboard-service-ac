/* Aturan stok barang roll (pipa AC, kabel, dll.) — dipakai server & browser.
   Stok roll = daftar roll utuh (panjang bisa berbeda-beda) + sisa eceran (qty, dalam meter). */
import type { Stok } from './types';

const r3 = (n: number) => +n.toFixed(3);
export const jumlahRoll = (s: Pick<Stok, 'rolls'>) => r3((s.rolls || []).reduce((a, x) => a + (+x || 0), 0));
/* total stok (untuk batas minimum & tampilan): eceran + semua roll utuh */
export const totalStok = (s: Pick<Stok, 'qty' | 'rolls' | 'roll'>) => r3((+s.qty || 0) + (s.roll ? jumlahRoll(s) : 0));

/* Pakai `butuh` meter: ambil dari eceran; kalau kurang, buka roll dari depan daftar sampai cukup.
   Kalau semua roll sudah habis dibuka, eceran boleh minus (tanda stok fisik harus dicek). */
export function pakaiRoll(qty: number, rolls: number[], butuh: number) {
  let eceran = +qty || 0;
  const sisaRoll = [...rolls];
  const dibuka: number[] = [];
  while (eceran < butuh && sisaRoll.length) {
    const p = sisaRoll.shift()!;
    dibuka.push(p);
    eceran = r3(eceran + p);
  }
  return { qty: r3(eceran - butuh), rolls: sisaRoll, dibuka };
}

/* ringkas tampilan: "3 roll (30 · 30 · 15 m) + 7,5 m eceran" */
export function ringkasRoll(s: Pick<Stok, 'qty' | 'rolls' | 'satuan'>) {
  const rolls = s.rolls || [];
  const sat = s.satuan || 'm';
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return `${rolls.length} roll${rolls.length ? ` (${rolls.map(fmt).join(' · ')} ${sat})` : ''} + ${fmt(+s.qty || 0)} ${sat} eceran`;
}
