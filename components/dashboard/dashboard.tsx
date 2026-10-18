'use client';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { UserButton } from '@clerk/nextjs';
import { RefreshCwIcon } from 'lucide-react';
import { loadAll } from '@/app/actions';
import { Logo } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { dueNotes, isLow, unpaid } from '@/lib/derive';
import type { Result } from '@/lib/types';
import { DashCtx, type Ctx, type Modal, type Tab } from './ctx';
import { Ringkasan } from './ringkasan';
import { OrderView, OrderDialog } from './order';
import { StokView, StokDialog, StokInDialog } from './stok';
import { AbsensiView, AbsDialog, KarDialog } from './absensi';
import { InvoiceView } from './invoice';
import { CatatanView, NoteDialog } from './catatan';
import { Pengaturan } from './pengaturan';
import { FormDialog } from './form-dialog';

const TABS: [Tab, string][] = [
  ['ringkasan', 'Ringkasan'], ['order', 'Order & Penjualan'], ['stok', 'Stok'], ['absensi', 'Absensi'],
  ['invoice', 'Invoice'], ['catatan', 'Catatan'], ['pengaturan', 'Pengaturan'],
];

async function fetchAll() {
  const r = await loadAll();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function Dashboard() {
  /* Data dibaca ulang tiap 15 detik & saat tab browser aktif lagi, supaya isian karyawan lain ikut muncul. */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { data: d, error, mutate, isValidating } = useSWR('all', fetchAll, {
    refreshInterval: 15000, revalidateOnFocus: true, keepPreviousData: true, onSuccess: () => setUpdatedAt(new Date()),
  });
  const [tab, setTab] = useState<Tab>(() => {
    try { const t = localStorage.getItem('sac-tab') as Tab | null; if (t && TABS.some(x => x[0] === t)) return t; } catch {}
    return 'ringkasan';
  });
  const [modal, setModal] = useState<Modal | null>(null);
  const [invSel, setInvSel] = useState<string | null>(null);

  const go = useCallback<Ctx['go']>((t, extra) => {
    setTab(t);
    if (extra?.invSel !== undefined) setInvSel(extra.invSel);
    try { localStorage.setItem('sac-tab', t); } catch {}
    window.scrollTo(0, 0);
  }, []);

  const run = useCallback<Ctx['run']>(async (p: Promise<Result>, ok) => {
    let r: Result;
    try { r = await p; } catch { r = { ok: false, error: 'Gagal menyimpan. Periksa koneksi lalu coba lagi.' }; }
    if (!r.ok) { toast.error(r.error); return false; }
    if (ok) toast.success(ok);
    await mutate();
    return true;
  }, [mutate]);

  const ctx = useMemo<Ctx | null>(() => (d ? { d, run, go, open: setModal, invSel, setInvSel } : null), [d, run, go, invSel]);

  const badges: Partial<Record<Tab, number>> = d ? { stok: d.stok.filter(isLow).length, invoice: unpaid(d).length, catatan: dueNotes(d).length } : {};
  const close = () => setModal(null);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="flex flex-wrap items-center gap-3 pt-3 pb-1.5">
            <Logo />
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.45rem] leading-tight">{d?.settings.nama || 'Dashboard Service AC'}</h1>
              <div className="muted text-[.85rem]">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}
              </div>
            </div>
            <div className="muted flex items-center gap-1.5 text-[.78rem]">
              <span className="inline-block size-2 rounded-full" style={{ background: error ? 'var(--bad)' : d ? 'var(--good)' : 'var(--ink-2)' }} />
              {error ? 'Gagal memuat' : updatedAt ? `Tersimpan bersama · ${updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Memuat…'}
              <Button variant="ghost" size="icon-xs" aria-label="Muat ulang data" onClick={() => mutate()} disabled={isValidating}>
                <RefreshCwIcon className={isValidating ? 'animate-spin' : ''} />
              </Button>
            </div>
            <UserButton />
          </div>
          <nav className="tabs" aria-label="Menu" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}>
                {l}{badges[k] ? <span className="badge">{badges[k]}</span> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap pt-5 pb-16">
        {!ctx ? (
          error ? (
            <div className="panel empty"><b>Data gagal dimuat</b>{error.message} <button className="linkbtn" onClick={() => mutate()}>Coba lagi</button></div>
          ) : (
            <div className="empty">Memuat data…</div>
          )
        ) : (
          <DashCtx.Provider value={ctx}>
            {tab === 'ringkasan' && <Ringkasan />}
            {tab === 'order' && <OrderView />}
            {tab === 'stok' && <StokView />}
            {tab === 'absensi' && <AbsensiView />}
            {tab === 'invoice' && <InvoiceView />}
            {tab === 'catatan' && <CatatanView />}
            {tab === 'pengaturan' && <Pengaturan />}

            {modal?.kind === 'order' && <OrderDialog key={modal.id || 'new'} id={modal.id} onClose={close} />}
            {modal?.kind === 'stok' && <StokDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'stok-in' && <StokInDialog id={modal.id} adj={modal.adj} onClose={close} />}
            {modal?.kind === 'kar' && <KarDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'abs' && <AbsDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'note' && <NoteDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'text' && (
              <FormDialog title={modal.title} onClose={close} wide={false}>
                <textarea className="field mono" style={{ minHeight: 260 }} readOnly defaultValue={modal.text} onFocus={e => e.currentTarget.select()} autoFocus />
                <p className="hint">Tekan lama / Ctrl+C untuk menyalin.</p>
              </FormDialog>
            )}
          </DashCtx.Provider>
        )}
      </main>
    </>
  );
}
