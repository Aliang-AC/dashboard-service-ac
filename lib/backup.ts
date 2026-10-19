import 'server-only';
import { adminDb } from './firebase-admin';
import { a1, isDefaultTab, sheetsApi } from './sheets';
import { normOrder, sisa, subtotalItems, subtotalParts } from './order';
import type { Absensi, Catatan, Karyawan, Mutasi, Pelanggan, Stok } from './types';

/* Backup semua data dashboard ke satu Google Sheet (BACKUP_SHEET_ID).
   Ditulis oleh akun robot Firebase (service account) — sheet harus dibagikan ke email akun itu sebagai Editor.
   Setiap backup menimpa isi tab-tab di bawah; tab lain buatan sendiri tidak disentuh. */

type Cell = string | number;
const TZ = 'Asia/Jakarta';

export const backupSheetUrl = () =>
  process.env.BACKUP_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.BACKUP_SHEET_ID}/edit` : null;

async function collect() {
  const db = adminDb();
  const all = async <T,>(name: string) => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }) as T);
  const [rawOrders, stok, mutasi, karyawan, absensi, catatan, pelanggan] = await Promise.all([
    all<Record<string, unknown>>('orders'), all<Stok>('stok'), all<Mutasi>('mutasi'),
    all<Karyawan>('karyawan'), all<Absensi>('absensi'), all<Catatan>('catatan'), all<Pelanggan>('pelanggan'),
  ]);
  const orders = rawOrders.map(normOrder);
  const nama = (id: string) => karyawan.find(k => k.id === id)?.nama || '';

  const tabs: Record<string, Cell[][]> = {
    Order: [
      ['No. invoice', 'Tanggal', 'Jam', 'Pelanggan', 'HP', 'Alamat', 'Teknisi', 'Pekerjaan', 'Total jasa',
        'Sparepart', 'Total sparepart', 'Diskon', 'Total', 'Status', 'Bayar', 'Dibayar', 'Sisa', 'Jatuh tempo', 'Pembayaran', 'Tgl lunas', 'Catatan pekerjaan'],
      ...orders
        .sort((a, b) => (a.tanggal + (a.jam || '')).localeCompare(b.tanggal + (b.jam || '')))
        .map(o => [
          o.invoice, o.tanggal, o.jam, o.pelanggan, o.hp, o.alamat, o.teknisi.map(nama).filter(Boolean).join(', '),
          o.items.map(i => `${i.layanan}${i.unit ? ' (' + i.unit + ')' : ''} x${i.qty} @${i.harga}`).join('; '), subtotalItems(o.items),
          (o.parts || []).map(p => `${p.nama} ${p.qty} ${p.satuan} x ${p.harga}`).join('; '), subtotalParts(o.parts || []),
          o.diskon, o.total, o.status, o.bayar, o.dibayar, sisa(o), o.jatuhTempo,
          o.pembayaran.map(p => `${p.tanggal} ${p.metode} ${p.jumlah}`).join('; '), o.paidAt || '', o.ket,
        ]),
    ],
    Pelanggan: [
      ['Nama', 'Jenis', 'HP', 'Alamat', 'Tempo (hari)', 'Servis tiap (bulan)', 'Unit AC', 'Catatan'],
      ...pelanggan.sort((a, b) => a.nama.localeCompare(b.nama)).map(p => [
        p.nama, p.jenis, p.hp, p.alamat, p.tempoHari || 0, p.intervalBulan || 3, (p.units || []).map(u => u.label).join('; '), p.catatan || '',
      ]),
    ],
    Stok: [
      ['Barang', 'Kategori', 'Satuan', 'Sisa', 'Minimum', 'Harga beli', 'Harga jual', 'Nilai stok (modal)'],
      ...stok
        .sort((a, b) => (a.kategori || '').localeCompare(b.kategori || '') || a.nama.localeCompare(b.nama))
        .map(s => [s.nama, s.kategori, s.satuan, +s.qty || 0, +s.min || 0, +(s.hargaBeli || 0), +s.hargaJual || 0, (+s.qty || 0) * +(s.hargaBeli || 0)]),
    ],
    'Mutasi stok': [
      ['Tanggal', 'Barang', 'Jenis', 'Qty', 'Keterangan'],
      ...mutasi.sort((a, b) => a.createdAt - b.createdAt).map(m => [m.tanggal, m.nama, m.jenis, m.qty, m.ket]),
    ],
    Karyawan: [
      ['Nama', 'Peran', 'HP', 'Akun login', 'Libur rutin', 'Status'],
      ...karyawan.sort((a, b) => a.nama.localeCompare(b.nama)).map(k => [
        k.nama, k.peran, k.hp, k.akun ? `${k.akun.username} (${k.akun.peran})` : '',
        (k.liburMingguan || []).map(h => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][h]).join(', '),
        k.nonaktif ? 'Nonaktif' : 'Aktif',
      ]),
    ],
    Absensi: [
      ['Tanggal', 'Nama', 'Status', 'Masuk', 'Pulang', 'Jarak masuk (m)', 'Cara', 'Dicatat oleh', 'Keterangan'],
      ...absensi
        .sort((a, b) => a.id.localeCompare(b.id))
        .flatMap(d => Object.entries(d.records || {}).map(([kid, r]) => [
          d.id, nama(kid), r.status || '', r.masuk || '', r.pulang || '', r.masukLoc?.jarak ?? '', r.via || '', r.oleh || '', r.ket || '',
        ])),
    ],
    Catatan: [
      ['Jenis', 'Judul', 'Detail', 'Tanggal', 'Jam', 'Pelanggan', 'Untuk', 'Selesai'],
      ...catatan.sort((a, b) => a.createdAt - b.createdAt).map(n => [n.tipe, n.judul, n.isi, n.tanggal, n.jam, n.pelanggan, nama(n.untuk), n.selesai ? 'Ya' : 'Belum']),
    ],
  };
  const rows = Object.values(tabs).reduce((a, t) => a + t.length - 1, 0);
  tabs.Info = [
    ['Backup terakhir', new Date().toLocaleString('id-ID', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }) + ' WIB'],
    ['Jumlah baris data', rows],
    ['Sumber', 'https://dashboard-service-ac.vercel.app'],
    ['Catatan', 'Tab-tab di sheet ini ditimpa otomatis setiap backup. Jangan diedit langsung; salin ke sheet lain kalau mau diolah.'],
  ];
  return { tabs, rows };
}

export async function runBackup(): Promise<{ rows: number; at: number }> {
  const sheetId = process.env.BACKUP_SHEET_ID;
  if (!sheetId) throw new Error('BACKUP_SHEET_ID belum diisi.');
  const { tabs, rows } = await collect();
  const api = await sheetsApi(sheetId);

  /* Pastikan semua tab ada; hapus tab bawaan kosong "Sheet1". */
  const existing = await api.tabs();
  const titles = Object.keys(tabs);
  const requests: object[] = titles.filter(t => !existing.some(e => e.title === t)).map(title => ({ addSheet: { properties: { title } } }));
  existing.filter(e => isDefaultTab(e.title)).forEach(e => requests.push({ deleteSheet: { sheetId: e.sheetId } }));
  if (requests.length) await api.call(':batchUpdate', { requests });

  await api.call('/values:batchClear', { ranges: titles.map(a1) });
  await api.call('/values:batchUpdate', { valueInputOption: 'RAW', data: titles.map(t => ({ range: `${a1(t)}!A1`, values: tabs[t] })) });

  const at = Date.now();
  await adminDb().doc('settings/backup').set({ at, rows });
  return { rows, at };
}
