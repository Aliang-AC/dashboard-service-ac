/* Daftar harga layanan & paket AC baru — aturan harga otomatis dan teks pricelist WA. Dipakai server & browser. */
import type { UnitAC } from './types';

/* jenis harga layanan: per PK (0,5–1 / 1,5–2 + tambahan inverter), tetap, ditentukan saat pengecekan, atau diisi admin */
export const JENIS_HARGA = { pk: 'Per PK', tetap: 'Harga tetap', cek: 'Saat pengecekan', manual: 'Diisi admin' } as const;
export type JenisHarga = keyof typeof JENIS_HARGA;
export type TarifLayanan = {
  id: string; nama: string; jenis: JenisHarga;
  harga1?: number; harga2?: number; inverter?: number; // jenis pk: 0,5–1 PK, 1,5–2 PK, tambahan AC inverter
  harga?: number;                                      // jenis tetap
  ket?: string;                                        // keterangan di pricelist WA (mis. tindakan, area)
};
/* paket AC baru: unit + alat lengkap + jasa pasang. stok = barang stok yang berkurang per paket (unit AC & alat). */
export type PaketAC = {
  id: string; merk: string; pk: string; tipe: 'Standard' | 'Inverter'; watt?: number;
  hargaUnit: number; hargaAlat: number; jasa: number;
  stok?: { itemId: string; qty: number }[];
  nonaktif?: boolean;
};
export type InfoPaket = { garansi?: string; garansiBulan?: number; alatStandar?: string };
export type Tarif = { layanan: TarifLayanan[]; paket: PaketAC[]; infoPaket: InfoPaket };
export const TARIF_KOSONG: Tarif = { layanan: [], paket: [], infoPaket: {} };

export const totalPaket = (p: Pick<PaketAC, 'hargaUnit' | 'hargaAlat' | 'jasa'>) => (+p.hargaUnit || 0) + (+p.hargaAlat || 0) + (+p.jasa || 0);
export const namaPaket = (p: Pick<PaketAC, 'merk' | 'pk'>) => `Paket AC ${p.merk} ${fmtPk(p.pk)}`;
export const fmtPk = (pk: string) => (pk ? (/pk/i.test(pk) ? pk : `${pk} PK`) : '');

/* "1/2" → 0.5, "3/4 PK" → 0.75, "1,5" → 1.5, "½" → 0.5; kosong / tidak terbaca → null */
export function angkaPk(pk?: string): number | null {
  const t = String(pk || '').toLowerCase().replace(/pk/g, '').replace('½', '1/2').replace('¾', '3/4').replace(',', '.').trim();
  if (!t) return null;
  const pecahan = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (pecahan) return +pecahan[2] ? +pecahan[1] / +pecahan[2] : null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Harga otomatis satu layanan untuk satu unit AC. harga null = harus diisi manual, dengan alasannya. */
export function hargaOtomatis(t: TarifLayanan | undefined, u?: Pick<UnitAC, 'pk' | 'inverter'> | null): { harga: number | null; info: string } {
  if (!t) return { harga: null, info: '' };
  if (t.jenis === 'tetap') return { harga: +t.harga! || 0, info: 'harga tetap' };
  if (t.jenis === 'cek') return { harga: null, info: 'Ditentukan saat pengecekan' };
  if (t.jenis === 'manual') return { harga: null, info: 'Diisi admin' };
  if (!u) return { harga: null, info: 'Pilih unit AC dulu' };
  const pk = angkaPk(u.pk);
  if (pk == null) return { harga: null, info: 'PK belum dikonfirmasi' };
  if (pk > 2) return { harga: null, info: 'Di atas 2 PK: ditentukan saat pengecekan' };
  const dasar = pk <= 1 ? +t.harga1! || 0 : +t.harga2! || 0;
  const tambah = u.inverter ? +t.inverter! || 0 : 0;
  const rp = (n: number) => n.toLocaleString('id-ID');
  return { harga: dasar + tambah, info: `${pk <= 1 ? '0,5–1 PK' : '1,5–2 PK'}: ${rp(dasar)}${tambah ? ` + ${rp(tambah)} inverter` : ''}` };
}

/* Teks daftar harga untuk WA, hanya kategori yang dipilih admin */
export function teksPricelist(t: Tarif, pilih: { layanan: string[]; merk: string[] }, kop: { merek: string; tagline: string; wa: string }) {
  const rp = (n?: number) => 'Rp ' + (+n! || 0).toLocaleString('id-ID');
  const bagian: string[] = [];
  for (const l of t.layanan.filter(x => pilih.layanan.includes(x.id))) {
    let s = `*${l.nama}*\n`;
    if (l.jenis === 'pk') {
      s += `• AC 0,5–1 PK: ${rp(l.harga1)}/unit\n• AC 1,5–2 PK: ${rp(l.harga2)}/unit\n`;
      if (l.inverter) s += `• AC smart inverter: +${rp(l.inverter)}/unit\n`;
    } else if (l.jenis === 'tetap') s += `• ${rp(l.harga)}\n`;
    else s += '• Harga menyesuaikan kondisi (dicek dulu)\n';
    if (l.ket) s += `_${l.ket}_\n`;
    bagian.push(s.trimEnd());
  }
  for (const merk of pilih.merk) {
    const ps = t.paket.filter(p => !p.nonaktif && p.merk === merk).sort((a, b) => (angkaPk(a.pk) || 0) - (angkaPk(b.pk) || 0));
    if (!ps.length) continue;
    let s = `*PAKET AC ${merk.toUpperCase()}*${t.infoPaket.garansi ? `\n${t.infoPaket.garansi}` : ''}\n`;
    for (const p of ps)
      s += `\n*${merk} ${fmtPk(p.pk)}*${p.tipe === 'Inverter' ? ' Inverter' : ' Standard'}${p.watt ? ` (${p.watt.toLocaleString('id-ID')} watt)` : ''}\n• Unit AC: ${rp(p.hargaUnit)}\n• Alat lengkap: ${rp(p.hargaAlat)}\n• Jasa pasang: ${rp(p.jasa)}\n*Total: ${rp(totalPaket(p))}*\n`;
    bagian.push(s.trimEnd());
  }
  if (pilih.merk.length && t.infoPaket.alatStandar) bagian.push(`_Alat standar (bawaan toko): ${t.infoPaket.alatStandar}_`);
  if (!bagian.length) return '';
  return `*Daftar Harga — ${kop.merek}*\n${kop.tagline}\n\n${bagian.join('\n\n')}\n\nAC di atas 2 PK & luar kota: harga menyesuaikan.\nWA : ${kop.wa} (Admin)`;
}
