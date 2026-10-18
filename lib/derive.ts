import type { AllData, Layanan, Stok } from './types';

export const LAYANAN_DEFAULT: Layanan[] = ['Cuci AC', 'Isi freon', 'Tambah freon', 'Perbaikan', 'Bongkar pasang', 'Pasang AC baru', 'Pengecekan'].map(nama => ({ nama, harga: 0 }));
export const STATUS_CLS: Record<string, string> = { Terjadwal: 'brand', Dikerjakan: 'accent', Selesai: 'good', 'Jadwal ulang': 'warn', Batal: 'bad' };
export const KATEGORI = ['Freon', 'Pipa & kabel', 'Sparepart', 'Unit AC', 'Bahan lain'];
export const SATUAN = ['pcs', 'kg', 'meter', 'roll', 'tabung', 'unit', 'set'];
export const NOTE_TYPES = ['Pengingat', 'Belum selesai', 'Jadwal ulang', 'Lainnya'];
export const NOTE_CLS: Record<string, string> = { Pengingat: 'brand', 'Belum selesai': 'accent', 'Jadwal ulang': 'warn', Lainnya: '' };
export const ABS_CLS: Record<string, string> = { Hadir: 'good', Izin: 'brand', Sakit: 'warn', Libur: '', Alpa: 'bad' };

export const layanan = (d: AllData) => (d.settings.layanan?.length ? d.settings.layanan : LAYANAN_DEFAULT);
export const activeKar = (d: AllData) => d.karyawan.filter(k => !k.nonaktif).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
export const karName = (d: AllData, id: string) => d.karyawan.find(k => k.id === id)?.nama || '';
export const isLow = (s: Stok) => (+s.qty || 0) <= (+s.min || 0);
export const omzetOrders = (d: AllData) => d.orders.filter(o => o.status === 'Selesai');
export const unpaid = (d: AllData) => d.orders.filter(o => o.status === 'Selesai' && o.bayar !== 'Lunas');
export const absToday = (d: AllData) => d.absensi.find(a => a.id === d.today)?.records || {};
export const dueNotes = (d: AllData) => d.catatan.filter(n => !n.selesai && n.tanggal && n.tanggal <= d.today);
