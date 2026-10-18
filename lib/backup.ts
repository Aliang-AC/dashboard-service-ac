import 'server-only';
import { JWT } from 'google-auth-library';
import { adminDb } from './firebase-admin';
import type { Absensi, Catatan, Karyawan, Mutasi, Order, Stok } from './types';

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
  const [orders, stok, mutasi, karyawan, absensi, catatan] = await Promise.all([
    all<Order>('orders'), all<Stok>('stok'), all<Mutasi>('mutasi'),
    all<Karyawan>('karyawan'), all<Absensi>('absensi'), all<Catatan>('catatan'),
  ]);
  const nama = (id: string) => karyawan.find(k => k.id === id)?.nama || '';

  const tabs: Record<string, Cell[][]> = {
    Order: [
      ['No. invoice', 'Tanggal', 'Jam', 'Pelanggan', 'HP', 'Alamat', 'Teknisi', 'Layanan', 'Unit AC', 'Jumlah unit',
        'Biaya jasa', 'Sparepart', 'Total sparepart', 'Diskon', 'Total', 'Status', 'Bayar', 'Metode', 'Tgl lunas', 'Catatan pekerjaan'],
      ...orders
        .sort((a, b) => (a.tanggal + (a.jam || '')).localeCompare(b.tanggal + (b.jam || '')))
        .map(o => [
          o.invoice, o.tanggal, o.jam, o.pelanggan, o.hp, o.alamat, nama(o.teknisi), o.layanan, o.unit, o.qtyUnit,
          o.jasa, (o.parts || []).map(p => `${p.nama} ${p.qty} ${p.satuan} x ${p.harga}`).join('; '),
          (o.parts || []).reduce((a, p) => a + p.qty * p.harga, 0), o.diskon, o.total, o.status, o.bayar, o.metode, o.paidAt || '', o.ket,
        ]),
    ],
    Stok: [
      ['Barang', 'Kategori', 'Satuan', 'Sisa', 'Minimum', 'Harga beli', 'Harga jual', 'Nilai stok (modal)'],
      ...stok
        .sort((a, b) => (a.kategori || '').localeCompare(b.kategori || '') || a.nama.localeCompare(b.nama))
        .map(s => [s.nama, s.kategori, s.satuan, +s.qty || 0, +s.min || 0, +s.hargaBeli || 0, +s.hargaJual || 0, (+s.qty || 0) * (+s.hargaBeli || 0)]),
    ],
    'Mutasi stok': [
      ['Tanggal', 'Barang', 'Jenis', 'Qty', 'Keterangan'],
      ...mutasi.sort((a, b) => a.createdAt - b.createdAt).map(m => [m.tanggal, m.nama, m.jenis, m.qty, m.ket]),
    ],
    Karyawan: [
      ['Nama', 'Peran', 'HP', 'Status'],
      ...karyawan.sort((a, b) => a.nama.localeCompare(b.nama)).map(k => [k.nama, k.peran, k.hp, k.nonaktif ? 'Nonaktif' : 'Aktif']),
    ],
    Absensi: [
      ['Tanggal', 'Nama', 'Status', 'Masuk', 'Pulang', 'Keterangan'],
      ...absensi
        .sort((a, b) => a.id.localeCompare(b.id))
        .flatMap(d => Object.entries(d.records || {}).map(([kid, r]) => [d.id, nama(kid), r.status || '', r.masuk || '', r.pulang || '', r.ket || ''])),
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

  const jwt = new JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await jwt.getAccessToken();
  const api = async (path: string, body?: unknown) => {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };

  /* Pastikan semua tab ada; hapus tab bawaan kosong "Sheet1". */
  const meta = await api('?fields=sheets.properties(sheetId,title)');
  const existing: { sheetId: number; title: string }[] = meta.sheets.map((s: { properties: { sheetId: number; title: string } }) => s.properties);
  const titles = Object.keys(tabs);
  const requests: object[] = titles.filter(t => !existing.some(e => e.title === t)).map(title => ({ addSheet: { properties: { title } } }));
  existing.filter(e => /^(Sheet|Lembar)\s?1$/.test(e.title)).forEach(e => requests.push({ deleteSheet: { sheetId: e.sheetId } }));
  if (requests.length) await api(':batchUpdate', { requests });

  const range = (t: string) => `'${t.replace(/'/g, "''")}'`;
  await api('/values:batchClear', { ranges: titles.map(range) });
  await api('/values:batchUpdate', { valueInputOption: 'RAW', data: titles.map(t => ({ range: `${range(t)}!A1`, values: tabs[t] })) });

  const at = Date.now();
  await adminDb().doc('settings/backup').set({ at, rows });
  return { rows, at };
}
