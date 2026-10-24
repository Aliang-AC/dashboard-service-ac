/* Aturan hitung order — dipakai server & browser. */
import type { BayarStatus, Metode, Order, OrderItem, Part, Pembayaran } from './types';

export const subtotalItems = (items: OrderItem[]) => items.reduce((a, i) => a + (+i.qty || 0) * (+i.harga || 0), 0);
export const subtotalParts = (parts: Part[]) => parts.reduce((a, p) => a + (+p.qty || 0) * (+p.harga || 0), 0);
export const hitungTotal = (items: OrderItem[], parts: Part[], diskon: number) =>
  Math.max(0, subtotalItems(items) + subtotalParts(parts) - (+diskon || 0));
export const jumlahBayar = (p: Pembayaran[]) => p.reduce((a, x) => a + (+x.jumlah || 0), 0);
export const statusBayar = (total: number, dibayar: number): BayarStatus =>
  dibayar >= total && total > 0 ? 'Lunas' : dibayar > 0 ? 'Sebagian' : total <= 0 ? 'Lunas' : 'Belum dibayar';
export const sisa = (o: Pick<Order, 'total' | 'dibayar'>) => Math.max(0, (+o.total || 0) - (+o.dibayar || 0));
export const ringkasItems = (items: OrderItem[]) =>
  items.map(i => `${i.layanan}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ');

/* lewat jatuh tempo: sudah ditagih, belum lunas, dan tempo sudah lewat (tempo kosong = belum pasti, tidak dihitung telat) */
export const telatBayar = (o: Pick<Order, 'belumDitagih' | 'bayar' | 'status' | 'jatuhTempo'>, today: string) =>
  !o.belumDitagih && o.bayar !== 'Lunas' && o.status !== 'Batal' && !!o.jatuhTempo && o.jatuhTempo < today;
/* umur piutang (hari sejak invoice diterbitkan) */
export const umurPiutang = (o: Pick<Order, 'tglInvoice'>, today: string) =>
  Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(o.tglInvoice + 'T00:00:00Z')) / 86_400_000));

/* "satu juta empat ratus dua puluh ribu rupiah" */
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function eja(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return eja(n - 10) + ' belas';
  if (n < 100) return eja(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + eja(n % 10) : '');
  if (n < 200) return 'seratus' + (n - 100 ? ' ' + eja(n - 100) : '');
  if (n < 1000) return eja(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + eja(n % 100) : '');
  if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + eja(n - 1000) : '');
  for (const [b, nama] of [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']] as const)
    if (n >= b) return eja(Math.floor(n / b)) + ' ' + nama + (n % b ? ' ' + eja(n % b) : '');
  return '';
}
export const terbilang = (n: number) => (Math.round(n) <= 0 ? 'nol rupiah' : eja(Math.round(n)).trim() + ' rupiah');

/* Pembayaran rekap dibagi ke order-order di dalamnya, mulai dari yang paling lama, sampai uang habis. */
export function alokasiBayar(orders: Pick<Order, 'id' | 'tanggal' | 'invoice' | 'total' | 'dibayar'>[], jumlah: number) {
  let sisaUang = Math.max(0, Math.round(jumlah));
  const hasil: { orderId: string; jumlah: number }[] = [];
  for (const o of [...orders].sort((a, b) => (a.tanggal + a.invoice).localeCompare(b.tanggal + b.invoice))) {
    if (sisaUang <= 0) break;
    const kurang = sisa(o);
    if (kurang <= 0) continue;
    const bayar = Math.min(kurang, sisaUang);
    hasil.push({ orderId: o.id, jumlah: bayar });
    sisaUang -= bayar;
  }
  return { hasil, lebih: sisaUang };
}

/* Order lama (satu layanan, teknisi tunggal, bayar Lunas/Belum lunas) → bentuk baru. Order baru dilewatkan apa adanya. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normOrder(raw: any): Order {
  const o = { ...raw };
  const items: OrderItem[] = Array.isArray(o.items) && o.items.length
    ? o.items
    : o.layanan ? [{ layanan: o.layanan, unit: o.unit || '', qty: +o.qtyUnit || 1, harga: (+o.jasa || 0) / (+o.qtyUnit || 1) }] : [];
  const parts: Part[] = Array.isArray(o.parts) ? o.parts : [];
  const teknisi: string[] = Array.isArray(o.teknisi) ? o.teknisi : o.teknisi ? [o.teknisi] : [];
  const total = typeof o.total === 'number' ? o.total : hitungTotal(items, parts, o.diskon);
  let pembayaran: Pembayaran[] = Array.isArray(o.pembayaran) ? o.pembayaran : [];
  if (!Array.isArray(o.pembayaran) && o.bayar === 'Lunas' && total > 0)
    pembayaran = [{ id: 'lama', tanggal: o.paidAt || o.tanggal, jumlah: total, metode: (o.metode || 'Tunai') as Metode, ket: 'data lama', oleh: '', at: o.updatedAt || 0 }];
  const dibayar = jumlahBayar(pembayaran);
  return {
    id: o.id, tanggal: o.tanggal, jam: o.jam || '',
    pelangganId: o.pelangganId || '', pelanggan: o.pelanggan || '', hp: o.hp || '', alamat: o.alamat || '',
    teknisi, items, parts, diskon: +o.diskon || 0, total,
    status: o.status, ket: o.ket || '',
    pembayaran, dibayar, bayar: statusBayar(total, dibayar), jatuhTempo: typeof o.jatuhTempo === 'string' ? o.jatuhTempo : o.tanggal,
    foto: Array.isArray(o.foto) ? o.foto : [], catatanTeknisi: o.catatanTeknisi || '', rekapId: o.rekapId || '',
    belumDitagih: !!o.belumDitagih, tglInvoice: o.tglInvoice || o.tanggal, jual: o.jual?.pembeli ? { pembeli: o.jual.pembeli } : null, inv: o.inv && typeof o.inv === 'object' ? o.inv : {},
    invoice: o.invoice || '', createdAt: o.createdAt || 0, updatedAt: o.updatedAt || 0, paidAt: o.paidAt || null,
  };
}
