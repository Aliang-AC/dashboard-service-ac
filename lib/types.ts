export type Part = { itemId: string; nama: string; satuan: string; qty: number; harga: number };

export type Order = {
  id: string;
  tanggal: string; jam: string;
  pelanggan: string; hp: string; alamat: string;
  teknisi: string; layanan: string; unit: string; qtyUnit: number;
  jasa: number; parts: Part[]; diskon: number; total: number;
  status: Status; bayar: 'Lunas' | 'Belum lunas'; metode: string; ket: string;
  invoice: string; createdAt: number; updatedAt: number; paidAt: string | null;
};
export type OrderInput = Omit<Order, 'id' | 'total' | 'invoice' | 'createdAt' | 'updatedAt' | 'paidAt' | 'parts'> & {
  parts: { itemId: string; qty: number; harga: number }[];
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
  orders: Order[]; stok: Stok[]; mutasi: Mutasi[]; karyawan: Karyawan[];
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
