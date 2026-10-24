import type { Tarif } from './tarif';
export type Part = { itemId: string; nama: string; satuan: string; qty: number; harga: number };

/* satu baris pekerjaan di order, mis. "Cuci AC 1/2–1 PK" · "Daikin – Kamar depan" × 2 @ 75.000 */
/* paket AC baru yang dipakai di baris order (salinan saat order dibuat; harga tarif berubah tidak mengubah order lama) */
export type PaketOrder = { id: string; merk: string; pk: string; tipe: string; watt?: number; hargaUnit: number; hargaAlat: number; jasa: number; stok: { itemId: string; qty: number }[]; garansiBulan?: number; garansi?: string };
/* perluHarga = harga belum bisa ditentukan otomatis (PK belum dikonfirmasi, >2 PK, layanan "saat pengecekan") — admin mengisi manual */
export type OrderItem = { layanan: string; unit: string; qty: number; harga: number; unitId?: string; paket?: PaketOrder; perluHarga?: boolean };
export const METODE = ['Tunai', 'Transfer', 'QRIS'] as const;
export type Metode = (typeof METODE)[number];
export type Pembayaran = { id: string; tanggal: string; jumlah: number; metode: Metode; ket: string; oleh: string; at: number };
export type BayarStatus = 'Lunas' | 'Sebagian' | 'Belum dibayar';

/* penjualan langsung: konsumen (harga jual biasa) atau mitra = teknisi luar / toko / subdealer (harga mitra) */
export const PEMBELI = { konsumen: 'Konsumen', mitra: 'Mitra (teknisi / toko / subdealer)' } as const;
export type Pembeli = keyof typeof PEMBELI;
/* Isian khusus invoice (bisa diubah admin): model kop, Kepada Yth./u.p., perihal, no. referensi instansi, catatan. */
export const MODEL_INVOICE = ['biasa', 'resmi'] as const;
export type InfoInvoice = { model?: (typeof MODEL_INVOICE)[number]; kepada?: string; perihal?: string; noRef?: string; catatan?: string; diubah?: { oleh: string; at: number }[] };
/* Bentuk order yang dipakai aplikasi (order lama dinormalkan otomatis lewat lib/order.ts → normOrder).
   Instansi: order selesai dulu (belumDitagih), invoice + nomornya diterbitkan admin belakangan.
   jatuhTempo '' = tempo belum pasti. tglInvoice = tanggal invoice diterbitkan. */
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
  belumDitagih: boolean; tglInvoice: string; inv: InfoInvoice;
  jual?: { pembeli: Pembeli } | null; // penjualan langsung (barang saja, tanpa jasa/jadwal)
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
export const FREON = ['R32', 'R410A', 'R22'] as const;
/* spesifikasi AC lama yang sudah diganti (stiker tetap di titik yang sama) */
export type RiwayatUnit = { merk?: string; pk?: string; tipe?: string; freon?: string; tahun?: string; sampai: string; ket: string; oleh: string };
/* 1 unit = 1 titik AC (stiker ditempel dekat dudukan remote). label = ruangan, mis. "Ruang Immunologi".
   gedung = salah satu dari Pelanggan.gedung (opsional); noAc = nomor AC / nomor aset instansi.
   fotoIndoor/fotoOutdoor = id foto name plate di Drive. cek = dicatat teknisi, belum dicek admin. */
export type UnitAC = {
  id: string; kode?: string; label: string;
  gedung?: string; noAc?: string;
  merk?: string; pk?: string; tipe?: string; freon?: string; tahun?: string;
  inverter?: boolean;                       // AC tipe inverter / smart inverter (harga layanan berbeda)
  garansi?: { sampai: string; ket: string }; // mis. AC baru dari paket: garansi s/d tanggal
  servisTerakhir?: string; perkiraan?: boolean; intervalBulan?: number;
  catatan?: string; fotoIndoor?: string; fotoOutdoor?: string;
  nonaktif?: boolean; riwayat?: RiwayatUnit[];
  cek?: boolean; dicatat?: { oleh: string; at: number };
};
/* Stiker QR bernomor (koleksi stiker/{kode}). Dicetak kosong dulu, aktif saat dipasang ke unit. */
export type StatusStiker = 'kosong' | 'aktif' | 'diganti';
export type Stiker = { kode: string; status: StatusStiker; pelangganId?: string; unitId?: string; batch: number; dibuatAt: number; dipasang?: { oleh: string; at: number } };
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
  rekening?: 'cv' | 'pribadi'; // rekening yang dicetak di invoice (kosong = instansi→CV, perorangan→pribadi)
  pengingat?: Pengingat;    // hasil follow-up terakhir
  baru?: boolean;           // masuk dari form daftar online, belum dicek admin
  diingatkan?: string;      // (lama) tanggal terakhir dihubungi
  cekTeknisi?: boolean;     // ada unit baru/diubah teknisi, belum dicek admin
  gedung?: string[];        // daftar gedung/area (instansi, kantor) — unit memilih dari sini
  updatedAt?: number;       // cegah simpan menimpa perubahan orang lain
};

/* hargaBeli disembunyikan (null) untuk selain pemilik */
/* Barang roll (roll=true): rolls = panjang tiap roll utuh (boleh beda-beda), qty = sisa eceran; panjangRoll = panjang bawaan roll baru.
   Barang biasa: qty = jumlah stok. Harga beli/jual per satuan (mis. per meter). */
export type Stok = {
  id: string; nama: string; kategori: string; satuan: string; qty: number; min: number; hargaBeli: number | null; hargaJual: number;
  hargaMitra?: number; // harga untuk teknisi luar / toko / subdealer (kosong = sama dengan harga jual)
  roll?: boolean; panjangRoll?: number; rolls?: number[];
};
export type Mutasi = { id: string; createdAt: number; tanggal: string; itemId: string; nama: string; jenis: 'Masuk' | 'Keluar' | 'Kembali' | 'Koreksi' | 'Buka roll'; qty: number | string; ket: string };

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
/* jamMasuk = Senin–Sabtu; jamMasukMinggu = khusus hari Minggu (kosong = sama dengan jamMasuk).
   rekening = rekening pribadi (invoice perorangan); rekeningInstansi = rekening atas nama CV (invoice instansi).
   penanggungJawab/jabatan/email/npwp = untuk kop & tanda tangan invoice resmi. */
export type Settings = {
  nama?: string; alamat?: string; hp?: string; jamMasuk?: string; jamMasukMinggu?: string; rekening?: string; layanan?: Layanan[];
  templatePengingat?: string; templateAjakForm?: string; templateScan?: string;
  rekeningInstansi?: string; penanggungJawab?: string; jabatan?: string; email?: string; npwp?: string;
};

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
  tarif: Tarif; // daftar harga (karyawan: hanya nama layanan, tanpa harga & paket)
  absensi: Absensi[]; catatan: Catatan[]; settings: Settings; lokasi: Lokasi | null;
  today: string;
  versi: number; // penanda versi data saat dimuat
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
