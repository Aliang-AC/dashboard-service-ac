/* Tim harian & rute — aturan bersama server & browser. Tim dikenali dari id ketuanya (1 tim per ketua per hari). */
import type { Karyawan, Order } from './types';

export type Tim = { id: string; ketua: string; anggota: string[]; bisaBantu?: boolean };
export type TimHari = { id: string; tanggal: string; tim: Tim[] }; // id dokumen = tanggal
export const ALASAN_KENDALA = ['Unit / barang belum datang', 'Waktu tidak cukup', 'Konsumen tidak di tempat', 'Cuaca / hujan', 'Pekerjaan lebih berat dari perkiraan', 'Lainnya'] as const;

export const anggotaTim = (t: Pick<Tim, 'ketua' | 'anggota'>) => [t.ketua, ...t.anggota.filter(a => a !== t.ketua)];
export const namaTim = (t: Pick<Tim, 'ketua'>, kar: Pick<Karyawan, 'id' | 'nama'>[]) => 'Tim ' + (kar.find(k => k.id === t.ketua)?.nama || '?');

/* urutan tetap: berdasarkan urutan ketua (Tim Jovanda 1, Tim Rudi 2, Tim Loren 3, …), lalu nama */
export function urutTim<T extends Pick<Tim, 'ketua'>>(tim: T[], kar: Pick<Karyawan, 'id' | 'nama' | 'urutan'>[]) {
  const k = (id: string) => kar.find(x => x.id === id);
  return tim.slice().sort((a, b) => ((k(a.ketua)?.urutan || 999) - (k(b.ketua)?.urutan || 999)) || (k(a.ketua)?.nama || '').localeCompare(k(b.ketua)?.nama || ''));
}

/* tim seseorang pada tanggal tertentu, dan apakah ia ketuanya */
export function timSaya(hari: TimHari | undefined, kid: string | null) {
  const t = kid ? hari?.tim.find(x => anggotaTim(x).includes(kid)) : undefined;
  return { tim: t, ketua: !!t && t.ketua === kid };
}

/* rute satu tim pada satu tanggal, urut nomor rute */
export const ruteTim = (orders: Order[], tanggal: string, timId: string) =>
  orders.filter(o => o.tanggal === tanggal && (o.timId || '') === timId && o.status !== 'Batal' && !o.jual)
    .sort((a, b) => (a.rute || 999) - (b.rute || 999) || (a.jam || '99').localeCompare(b.jam || '99'));

/* pesan cepat WA teknisi ke konsumen (kalimat bisa diatur admin) */
export const PESAN_CEPAT = [
  { judul: 'Menuju lokasi', teks: 'Halo Bapak/Ibu {nama}, kami {teknisi} dari Aliang AC sedang menuju lokasi untuk {pekerjaan}. Mohon ditunggu ya 🙏' },
  { judul: 'Sudah sampai', teks: 'Halo Bapak/Ibu {nama}, kami {teknisi} dari Aliang AC sudah tiba di lokasi. Terima kasih 🙏' },
];
export const isiPesanCepat = (teks: string, v: { nama: string; teknisi: string; pekerjaan: string }) =>
  teks.replace(/\{nama\}/g, v.nama).replace(/\{teknisi\}/g, v.teknisi).replace(/\{pekerjaan\}/g, v.pekerjaan);
