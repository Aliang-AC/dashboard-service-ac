'use client';
import { createContext, useContext } from 'react';
import type { AllData, Result } from '@/lib/types';

export type Tab = 'ringkasan' | 'order' | 'pelanggan' | 'stok' | 'absensi' | 'invoice' | 'catatan' | 'pengaturan';

export type Modal =
  | { kind: 'order'; id?: string; pelangganId?: string }
  | { kind: 'pelanggan'; id?: string }
  | { kind: 'bayar'; id: string }
  | { kind: 'tugas'; id: string }
  | { kind: 'rekapBaru' }
  | { kind: 'bayarRekap'; id: string }
  | { kind: 'stok'; id?: string }
  | { kind: 'stok-in'; id: string; adj: boolean }
  | { kind: 'kar'; id?: string }
  | { kind: 'akun'; id: string }
  | { kind: 'abs'; id: string; tanggal: string }
  | { kind: 'riwayat'; id: string; month: string }
  | { kind: 'libur' }
  | { kind: 'note'; id?: string }
  | { kind: 'text'; title: string; text: string };

export type Ctx = {
  d: AllData;
  /* jalankan aksi server; tampilkan toast; muat ulang data. true kalau berhasil */
  run: (p: Promise<Result>, ok?: string) => Promise<boolean>;
  go: (tab: Tab, extra?: { invSel?: string }) => void;
  open: (m: Modal) => void;
  invSel: string | null;
  setInvSel: (id: string | null) => void;
};

export const DashCtx = createContext<Ctx | null>(null);
export const useDash = () => {
  const c = useContext(DashCtx);
  if (!c) throw new Error('useDash di luar Dashboard');
  return c;
};

/* Ambil nilai form sebagai objek string sederhana. */
export const formObj = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>;
