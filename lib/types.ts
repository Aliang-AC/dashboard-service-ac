export type Part = { itemId: string; nama: string; satuan: string; qty: number; harga: number };

/* satu baris pekerjaan di order, mis. "Cuci AC 1/2–1 PK" · "Daikin – Kamar depan" × 2 @ 75.000 */
export type OrderItem = { layanan: string; unit: string; qty: number; harga: number; unitId?: string };
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
  foto: Foto[]; catatanTeknisi: string;
  rekapId: string; // kalau ditagih lewat invoice gabungan bulanan
  invoice: string; createdAt: number; updatedAt: number; paidAt: string | null;
};
/* Invoice gabungan bulanan untuk instansi: mengelompokkan beberapa order; total/sisa dihitung dari order-ordernya */
export type Rekap = {
  id: string; nomor: string; pelangganId: string; pelanggan: string; bulan: string;
  orderIds: string[]; tanggal: string; jatuhTempo: string; createdAt: number; oleh: string;
};
/* foto bukti kerja; id = id file di Google Drive (Shared Drive) */
export const JENIS_FOTO = ['Sebelum', 'Sesudah'] as const;
export type Foto = { id: string; jenis: (typeof JENIS_FOTO)[number]; oleh: string; olehUid: string; at: number };
/* bayarAwal: hanya untuk order baru — "Lunas" langsung saat dibuat */
export type OrderInput = {
  tanggal: string; jam: string;
  pelangganId: string | null; pelanggan: string; hp: string; alamat: string;
  teknisi: string[]; items: OrderItem[]; parts: { itemId: string; qty: number; harga: number }[];
  diskon: number; status: Status; ket: string; jatuhTempo: string;
  bayarAwal: Metode | null;
};

/* Unit AC di lokasi konsumen. kode = kode unik di stiker QR (mis. GT-0042).
   servisTerakhir: diisi manual/perkiraan; yang dipakai = yang terbaru antara ini dan order Selesai untuk unit tsb. */
export const TIPE_AC = ['Split', 'Cassette', 'Standing', 'Split duct', 'Window', 'Lainnya'] as const;
export type UnitAC = {
  id: string; kode?: string; label: string;  // label = ruangan/lokasi, mis. "Kamar depan"
  merk?: string; pk?: string; tipe?: string; tahun?: string;
  servisTerakhir?: string; perkiraan?: boolean; intervalBulan?: number;
};
export const JENIS_PELANGGAN = ['Perorangan', 'Instansi'] as const;  // cara penagihan
export const TIPE_LOKASI = ['Rumah', 'Kantor', 'Toko', 'Instansi', 'Lainnya'] as const;
export const HASIL_PENGINGAT = ['Mau', 'Nanti', 'Tidak', 'Nomor salah'] as const;
export type Pengingat = { hasil: (typeof HASIL_PENGINGAT)[number]; tanggal: string; ulang: string; oleh: string };
export type Pelanggan = {
  id: string; nama: string; hp: string; alamat: string; maps: string;
  jenis: (typeof JENIS_PELANGGAN)[number];
  tempoHari: number;      // tempo bayar (instansi), 0 = bayar di tempat
  intervalBulan: number;  // interval bawaan untuk unit baru
  units: UnitAC[]; catatan: string; createdAt: number;
  patokan?: string; tipeLokasi?: string; sumber?: string;
  izinPengingat?: boolean;  // default true
  pengingat?: Pengingat;    // hasil follow-up terakhir
  baru?: boolean;           // masuk dari form daftar online, belum dicek admin
  diingatkan?: string;      // (lama) tanggal terakhir dihubungi
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
/* jamMasuk = Senin–Sabtu; jamMasukMinggu = khusus hari Minggu (kosong = sama dengan jamMasuk) */
export type Settings = { nama?: string; alamat?: string; hp?: string; jamMasuk?: string; jamMasukMinggu?: string; rekening?: string; layanan?: Layanan[]; templatePengingat?: string };

/* jam masuk yang berlaku untuk tanggal tertentu (YYYY-MM-DD) */
export function jamMasukTgl(st: Pick<Settings, 'jamMasuk' | 'jamMasukMinggu'>, tanggal: string) {
  const minggu = new Date(tanggal + 'T00:00:00Z').getUTCDay() === 0;
  return (minggu && st.jamMasukMinggu) || st.jamMasuk || '08:00';
}
export type Lokasi = { lat: number; lng: number; radius: number };

export type Me = { uid: string; nama: string; login: string; peran: Peran; karyawanId: string | null };

export type AllData = {
  me: Me;
  orders: Order[]; stok: Stok[]; mutasi: Mutasi[]; karyawan: Karyawan[]; pelanggan: Pelanggan[]; rekap: Rekap[]; fotoAktif: boolean;
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
