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
    pembayaran, dibayar, bayar: statusBayar(total, dibayar), jatuhTempo: o.jatuhTempo || o.tanggal,
    foto: Array.isArray(o.foto) ? o.foto : [], catatanTeknisi: o.catatanTeknisi || '', rekapId: o.rekapId || '',
    invoice: o.invoice || '', createdAt: o.createdAt || 0, updatedAt: o.updatedAt || 0, paidAt: o.paidAt || null,
  };
}
