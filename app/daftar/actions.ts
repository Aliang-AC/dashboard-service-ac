'use server';
/* Form daftar online konsumen (publik, tanpa login).
   Pengaman: kolom jebakan bot (website harus kosong) + maks. 5 kiriman per jam per alamat IP. */
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { adminDb } from '@/lib/firebase-admin';
import { todayWIB } from '@/lib/format';
import { normalHp } from '@/lib/pin';
import { perkiraanTanggal } from '@/lib/servis';
import { TIPE_AC, TIPE_LOKASI, type Pelanggan, type UnitAC } from '@/lib/types';

export type DaftarInput = {
  nama: string; hp: string; alamat: string; patokan: string; maps: string; tipeLokasi: string;
  units: { label: string; merk: string; pk: string; tipe: string; terakhir: string }[];
  mauServis: boolean; izin: boolean; catatan: string; website: string;
};

const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export async function daftarKonsumen(v: DaftarInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (s(v.website, 100)) return { ok: true }; // bot mengisi kolom jebakan → pura-pura berhasil
    const nama = s(v.nama, 120), hpNorm = normalHp(v.hp);
    if (!nama) return { ok: false, error: 'Nama wajib diisi.' };
    if (!hpNorm) return { ok: false, error: 'Nomor WhatsApp tidak valid. Contoh: 081234567890.' };
    const today = todayWIB();
    const unitsIn = (v.units || []).slice(0, 15)
      .map(u => ({ label: s(u.label, 80), merk: s(u.merk, 40), pk: s(u.pk, 10), tipe: TIPE_AC.includes(u.tipe as never) ? u.tipe : 'Split', terakhir: s(u.terakhir, 5) }))
      .filter(u => u.label || u.merk);

    /* batasi kiriman per IP */
    const h = await headers();
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'tanpa-ip';
    const db = adminDb();
    const rl = db.doc('ratelimit/daftar-' + createHash('sha256').update(ip).digest('hex').slice(0, 32));
    const ok = await db.runTransaction(async tx => {
      const r = await tx.get(rl);
      const jam = Math.floor(Date.now() / 3_600_000);
      const n = r.get('jam') === jam ? (r.get('n') || 0) : 0;
      if (n >= 5) return false;
      tx.set(rl, { jam, n: n + 1 });
      return true;
    });
    if (!ok) return { ok: false, error: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi 1 jam lagi atau hubungi kami lewat WhatsApp.' };

    await db.runTransaction(async tx => {
      const ada = await tx.get(db.collection('pelanggan').where('hpNorm', '==', hpNorm).limit(1));
      const counterRef = db.doc('counters/unit');
      const counter = await tx.get(counterRef);
      let n = counter.get('n') || 0;
      const lama = ada.empty ? null : ({ id: ada.docs[0].id, ...ada.docs[0].data() } as Pelanggan);
      const sudah = new Set((lama?.units || []).map(u => (u.label + '|' + (u.merk || '')).toLowerCase()));
      const baruUnits: UnitAC[] = unitsIn
        .filter(u => !sudah.has((u.label + '|' + u.merk).toLowerCase()))
        .map(u => ({
          id: Math.random().toString(36).slice(2, 10), kode: 'GT-' + String(++n).padStart(4, '0'),
          label: u.label, merk: u.merk, pk: u.pk, tipe: u.tipe,
          servisTerakhir: perkiraanTanggal(u.terakhir, today), perkiraan: u.terakhir !== 'lupa' && !!perkiraanTanggal(u.terakhir, today),
          intervalBulan: lama?.intervalBulan || 3,
        }));
      if (n !== (counter.get('n') || 0)) tx.set(counterRef, { n });
      const maps = s(v.maps, 300), patokan = s(v.patokan, 200), alamat = s(v.alamat, 300);
      if (lama) {
        const units = [...(lama.units || []), ...baruUnits].slice(0, 60);
        tx.update(ada.docs[0].ref, {
          units, unitKodes: units.map(u => u.kode).filter(Boolean), baru: true,
          ...(alamat && !lama.alamat ? { alamat } : {}), ...(maps && !lama.maps ? { maps } : {}), ...(patokan && !lama.patokan ? { patokan } : {}),
          izinPengingat: !!v.izin,
        });
      } else {
        tx.set(db.collection('pelanggan').doc(), {
          nama, hp: s(v.hp, 30), hpNorm, alamat, maps, patokan,
          tipeLokasi: TIPE_LOKASI.includes(v.tipeLokasi as never) ? v.tipeLokasi : 'Rumah',
          jenis: v.tipeLokasi === 'Instansi' ? 'Instansi' : 'Perorangan', tempoHari: v.tipeLokasi === 'Instansi' ? 30 : 0,
          intervalBulan: 3, units: baruUnits, unitKodes: baruUnits.map(u => u.kode), catatan: s(v.catatan, 1000),
          sumber: 'Form online', izinPengingat: !!v.izin, baru: true, createdAt: Date.now(),
        });
      }
      if (v.mauServis) {
        tx.set(db.collection('catatan').doc(), {
          tipe: 'Pengingat', judul: `Minta jadwal servis: ${nama}`, isi: [`WA ${s(v.hp, 30)}`, alamat, s(v.catatan, 500)].filter(Boolean).join(' · '),
          tanggal: today, jam: '', pelanggan: nama, untuk: '', selesai: false, createdAt: Date.now(),
        });
      }
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Pendaftaran gagal terkirim. Coba lagi sebentar lagi.' };
  }
}
