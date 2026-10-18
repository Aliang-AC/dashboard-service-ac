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

export type Stok = { id: string; nama: string; kategori: string; satuan: string; qty: number; min: number; hargaBeli: number; hargaJual: number };
export type Mutasi = { id: string; createdAt: number; tanggal: string; itemId: string; nama: string; jenis: 'Masuk' | 'Keluar' | 'Kembali' | 'Koreksi'; qty: number | string; ket: string };
export type Karyawan = { id: string; nama: string; peran: string; hp: string; nonaktif: boolean };
export type AbsRecord = { status?: AbsStatus; masuk?: string; pulang?: string; ket?: string };
export type Absensi = { id: string; tanggal: string; records: Record<string, AbsRecord> };
export type Catatan = {
  id: string; tipe: string; judul: string; isi: string; tanggal: string; jam: string;
  pelanggan: string; untuk: string; selesai: boolean; doneAt?: number; createdAt: number;
};
export type Layanan = { nama: string; harga: number };
export type Settings = { nama?: string; alamat?: string; hp?: string; jamMasuk?: string; rekening?: string; layanan?: Layanan[] };
export type Pengguna = { email: string; nama: string };

export type Me = { email: string; nama: string; owner: boolean };

export type AllData = {
  me: Me;
  orders: Order[]; stok: Stok[]; mutasi: Mutasi[]; karyawan: Karyawan[];
  absensi: Absensi[]; catatan: Catatan[]; settings: Settings; pengguna: Pengguna[];
  today: string;
  /* hanya diisi untuk pemilik */
  backup: { at: number; rows: number } | null; backupUrl: string | null;
};

export type Result = { ok: true } | { ok: false; error: string };

export const STATUS = ['Terjadwal', 'Dikerjakan', 'Selesai', 'Jadwal ulang', 'Batal'] as const;
export type Status = (typeof STATUS)[number];
export const ABS_ST = ['Hadir', 'Izin', 'Sakit', 'Libur', 'Alpa'] as const;
export type AbsStatus = (typeof ABS_ST)[number];
