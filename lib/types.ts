export type Part = { itemId: string; nama: string; satuan: string; qty: number; harga: number };

/* satu baris pekerjaan di order, mis. "Cuci AC 1/2–1 PK" · "Daikin – Kamar depan" × 2 @ 75.000 */
export type OrderItem = { layanan: string; unit: string; qty: number; harga: number };
export const METODE = ['Tunai', 'Transfer', 'QRIS'] as const;
export type Metode = (typeof METODE)[number];
export type Pembayaran = { id: string; tanggal: string; jumlah: number; metode: Metode; ket: string; oleh: string; at: number };
export type BayarStatus = 'Lunas' | 'Sebagian' | 'Belum dibayar';

/* Bentuk order yang dipakai aplikasi (order lama dinormalkan otomatis lewat lib/order.ts → normOrder). */
export type Order = {
  id: string;
  tanggal: string; jam: string;
  pelangganId: string; pelanggan: string; hp: string; alamat: string;
  teknisi: string[];
  items: OrderItem[]; parts: Part[]; diskon: number; total: number;
  status: Status; ket: string;
  pembayaran: Pembayaran[]; dibayar: number; bayar: BayarStatus; jatuhTempo: string;
  invoice: string; createdAt: number; updatedAt: number; paidAt: string | null;
};
/* bayarAwal: hanya untuk order baru — "Lunas" langsung saat dibuat */
export type OrderInput = {
  tanggal: string; jam: string;
  pelangganId: string | null; pelanggan: string; hp: string; alamat: string;
  teknisi: string[]; items: OrderItem[]; parts: { itemId: string; qty: number; harga: number }[];
  diskon: number; status: Status; ket: string; jatuhTempo: string;
  bayarAwal: Metode | null;
};

export type UnitAC = { id: string; label: string };
export const JENIS_PELANGGAN = ['Perorangan', 'Instansi'] as const;
export type Pelanggan = {
  id: string; nama: string; hp: string; alamat: string; maps: string;
  jenis: (typeof JENIS_PELANGGAN)[number];
  tempoHari: number;      // tempo bayar (instansi), 0 = bayar di tempat
  intervalBulan: number;  // pengingat servis berikutnya
  units: UnitAC[]; catatan: string; createdAt: number;
};

/* hargaBeli disembunyikan (null) untuk selain pemilik */
export type Stok = { id: string; nama: string; kategori: string; satuan: string; qty: number; min: number; hargaBeli: number | null; hargaJual: number };
export type Mutasi = { id: string; createdAt: number; tanggal: string; itemId: string; nama: string; jenis: 'Masuk' | 'Keluar' | 'Kembali' | 'Koreksi'; qty: number | string; ket: string };

export type Peran = 'owner' | 'admin' | 'karyawan';
/* liburMingguan: hari libur rutin, 0 = Minggu … 6 = Sabtu.
   akun: akun login (nomor HP) yang terhubung ke karyawan ini. */
export type Karyawan = {
  id: string; nama: string; peran: string; hp: string; nonaktif: boolean;
  liburMingguan?: number[];
  akun?: { uid: string; username: string; peran: 'admin' | 'karyawan' } | null;
};

export type AbsLoc = { lat: number; lng: number; jarak: number; acc: number };
/* via: QR (scan di bengkel), Manual (diinput pemilik/admin), Otomatis (Alpa tengah malam) */
export type AbsRecord = {
  status?: AbsStatus; masuk?: string; pulang?: string; ket?: string;
  masukLoc?: AbsLoc; pulangLoc?: AbsLoc;
  via?: 'QR' | 'Manual' | 'Otomatis'; oleh?: string;
};
export type Absensi = { id: string; tanggal: string; records: Record<string, AbsRecord> };
export type Catatan = {
  id: string; tipe: string; judul: string; isi: string; tanggal: string; jam: string;
  pelanggan: string; untuk: string; selesai: boolean; doneAt?: number; createdAt: number;
};
export type Layanan = { nama: string; harga: number };
export type Settings = { nama?: string; alamat?: string; hp?: string; jamMasuk?: string; rekening?: string; layanan?: Layanan[] };
export type Lokasi = { lat: number; lng: number; radius: number };

export type Me = { uid: string; nama: string; login: string; peran: Peran; karyawanId: string | null };

export type AllData = {
  me: Me;
  orders: Order[]; stok: Stok[]; mutasi: Mutasi[]; karyawan: Karyawan[]; pelanggan: Pelanggan[];
  absensi: Absensi[]; catatan: Catatan[]; settings: Settings; lokasi: Lokasi | null;
  today: string;
  /* hanya diisi untuk pemilik */
  backup: { at: number; rows: number } | null; backupUrl: string | null; arsipUrl: string | null;
};

export type Result = { ok: true } | { ok: false; error: string };
export type ResultOf<T> = { ok: true; data: T } | { ok: false; error: string };

export const STATUS = ['Terjadwal', 'Dikerjakan', 'Selesai', 'Jadwal ulang', 'Batal'] as const;
export type Status = (typeof STATUS)[number];
export const ABS_ST = ['Hadir', 'Izin', 'Sakit', 'Libur', 'Alpa'] as const;
export type AbsStatus = (typeof ABS_ST)[number];
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
