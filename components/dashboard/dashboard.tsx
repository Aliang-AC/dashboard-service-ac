'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { UserButton } from '@clerk/nextjs';
import {
  Bell, Building2, History, CalendarDays, Clock, LayoutDashboard, MenuIcon, NotebookPen, Package, QrCode, Receipt, RefreshCwIcon, Settings,
  Snowflake, Tag, Users, Warehouse, Wrench, type LucideIcon,
} from 'lucide-react';
import { ambilOrder, loadAll, versiData } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { dueNotes, isLow } from '@/lib/derive';
import type { AllData, Order, Result } from '@/lib/types';
import { DashCtx, type Ctx, type Modal, type Tab } from './ctx';
import { Ringkasan } from './ringkasan';
import { OrderView, OrderDialog } from './order';
import { StikerUnitDialog } from './unit-admin';
import { UnitLapanganDialog } from './unit-lapangan';
import { HargaView, KirimHargaDialog } from './harga';
import { PenjualanDialog, PenjualanView } from './penjualan';
import { AturTimDialog, PesanCepatDialog } from './rute';
import { AjukanIzinDialog } from './izin';
import { RiwayatView } from './riwayat';
import { BukaRollDialog, StokView, StokDialog, StokInDialog } from './stok';
import { AbsensiView, AbsDialog, KarDialog, AkunDialog, LiburDialog, RiwayatDialog } from './absensi';
import { InvoiceView, BayarDialog, InfoInvoiceDialog, TerbitDialog } from './invoice';
import { PelangganView, PelangganDialog, perluDiingatkan } from './pelanggan';
import { TugasDialog } from './tugas';
import { RekapBaruDialog, BayarRekapDialog, RekapView } from './rekap';
import { BagikanFormDialog } from './bagikan';
import { CatatanView, NoteDialog } from './catatan';
import { Pengaturan } from './pengaturan';
import { FormDialog } from './form-dialog';
import type { Peran } from '@/lib/types';
import { MEREK } from '@/lib/brand';

/* Menu samping berkelompok. href = buka halaman terpisah (tab baru). */
type ItemMenu = { key: Tab | 'stiker'; label: string; ic: LucideIcon; href?: string };
const MENU: { grup: string; items: ItemMenu[] }[] = [
  { grup: 'Beranda', items: [{ key: 'ringkasan', label: 'Dashboard', ic: LayoutDashboard }] },
  { grup: 'Operasional', items: [{ key: 'order', label: 'Jadwal & Order', ic: CalendarDays }, { key: 'absensi', label: 'Absensi Karyawan', ic: Clock }] },
  { grup: 'Sales & Penjualan', items: [
    { key: 'jasa', label: 'Jasa Service AC', ic: Snowflake }, { key: 'unitac', label: 'Penjualan Unit AC', ic: Package },
    { key: 'sparepart', label: 'Penjualan Sparepart', ic: Wrench }, { key: 'harga', label: 'Daftar Harga', ic: Tag },
  ] },
  { grup: 'Pelanggan', items: [
    { key: 'pelanggan', label: 'Data Pelanggan', ic: Users }, { key: 'pengingat', label: 'Pengingat Servis', ic: Bell },
    { key: 'stiker', label: 'Stiker QR', ic: QrCode, href: '/stiker' },
  ] },
  { grup: 'Keuangan', items: [{ key: 'invoice', label: 'Invoice & Pembayaran', ic: Receipt }, { key: 'tagihan', label: 'Tagihan Instansi', ic: Building2 }] },
  { grup: 'Gudang', items: [{ key: 'stok', label: 'Stok Barang', ic: Warehouse }] },
  { grup: 'Lainnya', items: [
    { key: 'catatan', label: 'Catatan', ic: NotebookPen }, { key: 'riwayat', label: 'Riwayat & Sampah', ic: History }, { key: 'pengaturan', label: 'Pengaturan', ic: Settings },
  ] },
];
const MENU_TEKNISI: { grup: string; items: ItemMenu[] }[] = [
  { grup: 'Menu saya', items: [
    { key: 'order', label: 'Jadwal saya', ic: CalendarDays }, { key: 'absensi', label: 'Absensi saya', ic: Clock }, { key: 'catatan', label: 'Catatan', ic: NotebookPen },
  ] },
];
const menuFor = (p: Peran) => (p === 'karyawan' ? MENU_TEKNISI
  : p === 'admin' ? MENU.map(g => ({ ...g, items: g.items.filter(i => i.key !== 'pengaturan' && i.key !== 'riwayat') }))
    : MENU);
const SEMUA_TAB = MENU.flatMap(g => g.items.map(i => i.key));
const PERAN_LABEL: Record<Peran, string> = { owner: 'Pemilik', admin: 'Admin', karyawan: 'Karyawan', layar: 'Perangkat absen' };

/* angka kecil di samping menu: merah = perlu segera, oranye = perlu dicek */
function badgeMenu(d: AllData): Partial<Record<Tab, { n: number; w?: boolean }>> {
  if (d.me.peran === 'karyawan') return { catatan: { n: dueNotes(d).length } };
  const t = d.today;
  const lewat = d.orders.filter(o => !o.belumDitagih && o.bayar !== 'Lunas' && o.status !== 'Batal' && !!o.jatuhTempo && o.jatuhTempo < t).length;
  const belumTagih = d.orders.filter(o => o.belumDitagih && o.status === 'Selesai' && !o.rekapId).length;
  return {
    order: { n: d.orders.filter(o => (o.items.some(i => i.perluHarga) || !!o.kendala) && o.status !== 'Batal').length, w: true },
    absensi: { n: d.izin.filter(i => i.status === 'menunggu').length },
    pengingat: { n: d.pelanggan.filter(p => perluDiingatkan(d, p)).length },
    pelanggan: { n: d.pelanggan.filter(p => p.baru || p.cekTeknisi).length, w: true },
    invoice: { n: lewat },
    tagihan: { n: belumTagih, w: true },
    stok: { n: d.stok.filter(isLow).length, w: true },
    catatan: { n: dueNotes(d).length, w: true },
  };
}

async function fetchAll() {
  const r = await loadAll();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function Dashboard() {
  /* Hemat database: tiap 15 detik (dan saat aplikasi dibuka lagi) hanya mengecek penanda versi data yang kecil;
     semua data baru dimuat ulang kalau ada perubahan dari orang lain. */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { data: dMuat, error, mutate, isValidating } = useSWR('all', fetchAll, {
    refreshInterval: 0, revalidateOnFocus: false, keepPreviousData: true, onSuccess: () => setUpdatedAt(new Date()),
  });
  const { data: versi } = useSWR('versi', versiData, { refreshInterval: 15000, revalidateOnFocus: true, dedupingInterval: 4000 });
  useEffect(() => { if (versi && dMuat && versi !== dMuat.versi) mutate(); }, [versi, dMuat, mutate]);
  /* order lama hasil "Cari order lama": digabung ke data, dan diambil ulang tiap data berubah supaya tetap segar */
  const [lama, setLama] = useState<Order[]>([]);
  const tambahOrder = useCallback((os: Order[]) => setLama(xs => [...xs.filter(x => !os.some(y => y.id === x.id)), ...os]), []);
  const versiMuat = dMuat?.versi;
  useEffect(() => {
    if (!versiMuat || !lama.length) return;
    let batal = false;
    ambilOrder(lama.map(x => x.id)).then(r => { if (!batal && r.ok) setLama(r.data); });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versiMuat]);
  const d = useMemo(() => {
    if (!dMuat || !lama.length) return dMuat;
    const ada = new Set(dMuat.orders.map(o => o.id));
    return { ...dMuat, orders: [...dMuat.orders, ...lama.filter(o => !ada.has(o.id))] };
  }, [dMuat, lama]);
  const [rawTab, setTab] = useState<Tab>(() => {
    try { const t = localStorage.getItem('sac-tab') as Tab | null; if (t && SEMUA_TAB.includes(t)) return t; } catch {}
    return 'ringkasan';
  });
  const [laci, setLaci] = useState(false); // menu samping terbuka (HP)
  const menu = d ? menuFor(d.me.peran) : [];
  const bolehTab = menu.flatMap(g => g.items.filter(i => !i.href).map(i => i.key as Tab));
  /* tab tersimpan bisa tidak berlaku untuk peran ini → pakai menu pertama */
  const tab: Tab = bolehTab.includes(rawTab) ? rawTab : bolehTab[0] || 'ringkasan';
  const judulTab = menu.flatMap(g => g.items).find(i => i.key === tab)?.label || '';
  const [modal, setModal] = useState<Modal | null>(null);
  const [invSel, setInvSel] = useState<string | null>(null);

  /* Tombol Kembali (HP): tutup jendela/menu yang terbuka dulu; untuk keluar dari aplikasi harus ditekan 2× dalam 2 detik. */
  const terbuka = useRef(false);
  useEffect(() => { terbuka.current = !!modal || laci; }, [modal, laci]);
  useEffect(() => {
    /* Satu "penahan" di riwayat browser: Kembali pertama hanya melepas penahan (aplikasi tetap terbuka) dan
       memunculkan pesan; Kembali kedua dalam 2 detik benar-benar keluar. Chrome mengabaikan penahan yang dipasang
       tanpa sentuhan pengguna, jadi penahan dipasang saat pengguna menyentuh / mengetik di dashboard. */
    let ada = false, siap = 0;
    let tunda: ReturnType<typeof setTimeout> | undefined;
    const tahan = () => { if (!ada && Date.now() >= siap) { history.pushState({ sac: 1 }, ''); ada = true; } };
    const onPop = () => {
      clearTimeout(tunda);
      ada = false;
      if (terbuka.current) { setModal(null); setLaci(false); tahan(); return; }
      toast('Tekan kembali sekali lagi untuk keluar', { duration: 2000 });
      siap = Date.now() + 2000; // selama 2 detik penahan tidak dipasang lagi → Kembali berikutnya keluar
      tunda = setTimeout(tahan, 2050); // setelah 2 detik dipasang lagi (sentuhan berikutnya juga memasangnya)
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('pointerdown', tahan, true);
    window.addEventListener('keydown', tahan, true);
    return () => {
      clearTimeout(tunda);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pointerdown', tahan, true);
      window.removeEventListener('keydown', tahan, true);
    };
  }, []);

  const go = useCallback<Ctx['go']>((t, extra) => {
    setTab(t);
    setLaci(false);
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

  const ctx = useMemo<Ctx | null>(() => (d ? { d, run, go, open: setModal, invSel, setInvSel, tambahOrder } : null), [d, run, go, invSel, tambahOrder]);
  const badges = d ? badgeMenu(d) : {};
  const close = () => setModal(null);

  return (
    <div className="shell">
      <div className={`shade${laci ? ' buka' : ''}`} onClick={() => setLaci(false)} aria-hidden />
      <aside className={`side${laci ? ' buka' : ''}`} aria-label="Menu">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="lg"><img src="/logo.svg" alt="" width={32} height={32} /></span>
          <span><b>{MEREK}</b><small>{d ? PERAN_LABEL[d.me.peran] : ''}</small></span>
        </div>
        {menu.map(g => (
          <div key={g.grup}>
            <div className="grp">{g.grup}</div>
            {g.items.map(i => {
              const Ic = i.ic, b = i.href ? undefined : badges[i.key as Tab];
              return i.href
                ? <a key={i.key} className="it" href={i.href}><Ic />{i.label}</a>
                : (
                  <button key={i.key} className="it" aria-current={tab === i.key ? 'page' : undefined} onClick={() => go(i.key as Tab)}>
                    <Ic />{i.label}{b?.n ? <span className={`badge${b.w ? ' w' : ''}`}>{b.n}</span> : null}
                  </button>
                );
            })}
          </div>
        ))}
        <div className="foot"><UserButton /><span>{d?.me.nama}</span></div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="mainbar">
          <div className="in">
            <Button variant="ghost" size="icon" className="menu-btn min-[901px]:hidden" aria-label="Buka menu" onClick={() => setLaci(true)}><MenuIcon /></Button>
            <div className="min-w-0 flex-1">
              <b className="text-[1.05rem]">{judulTab}</b>
              <div className="muted text-[.8rem]">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</div>
            </div>
            <div className="muted flex items-center gap-1.5 text-[.78rem]">
              <span className="inline-block size-2 rounded-full" style={{ background: error ? 'var(--bad)' : d ? 'var(--good)' : 'var(--ink-2)' }} />
              <span className="hidden sm:inline">{error ? 'Gagal memuat' : updatedAt ? `Tersimpan · ${updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Memuat…'}</span>
              <Button variant="ghost" size="icon-xs" aria-label="Muat ulang data" onClick={() => mutate()} disabled={isValidating}>
                <RefreshCwIcon className={isValidating ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>
        </header>

      <main className="isi">
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
            {tab === 'jasa' && <OrderView jenis="jasa" />}
            {tab === 'unitac' && <PenjualanView jenis="unit" />}
            {tab === 'sparepart' && <PenjualanView jenis="sparepart" />}
            {tab === 'pelanggan' && <PelangganView key="semua" />}
            {tab === 'pengingat' && <PelangganView key="ingat" awal="Dihubungi" />}
            {tab === 'harga' && <HargaView key={d ? JSON.stringify(d.tarif) : ''} />}
            {tab === 'stok' && <StokView />}
            {tab === 'absensi' && <AbsensiView />}
            {tab === 'invoice' && <InvoiceView />}
            {tab === 'tagihan' && (
              <>
                <div className="section-head"><div><h2>Tagihan instansi</h2><p>Gabungkan pekerjaan instansi (RSUD, kantor, dll.) menjadi satu tagihan resmi, lalu catat pembayarannya.</p></div></div>
                <RekapView />
              </>
            )}
            {tab === 'catatan' && <CatatanView />}
            {tab === 'pengaturan' && <Pengaturan />}
            {tab === 'riwayat' && <RiwayatView />}

            {modal?.kind === 'jual' && <PenjualanDialog key={modal.id || 'baru'} id={modal.id} jenis={modal.jenis} onClose={close} />}

            {modal?.kind === 'order' && <OrderDialog key={modal.id || 'new-' + (modal.pelangganId || '') + (modal.timId || '')} id={modal.id} pelangganId={modal.pelangganId} unitIds={modal.unitIds} tanggalAwal={modal.tanggal} timAwal={modal.timId} onClose={close} />}
            {modal?.kind === 'aturTim' && <AturTimDialog key={modal.tanggal} tanggal={modal.tanggal} onClose={close} />}
            {modal?.kind === 'pesanCepat' && <PesanCepatDialog onClose={close} />}
            {modal?.kind === 'izin' && <AjukanIzinDialog onClose={close} />}
            {modal?.kind === 'stikerUnit' && <StikerUnitDialog key={modal.unitId} pelangganId={modal.pelangganId} unitId={modal.unitId} onClose={close} />}
            {modal?.kind === 'pelanggan' && <PelangganDialog key={modal.id || 'new'} id={modal.id} onClose={close} />}
            {modal?.kind === 'bayar' && <BayarDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'terbit' && <TerbitDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'infoInvoice' && <InfoInvoiceDialog key={modal.id} id={modal.id} onClose={close} />}
            {modal?.kind === 'tugas' && <TugasDialog key={modal.id} id={modal.id} onClose={close} />}
            {modal?.kind === 'unit' && <UnitLapanganDialog key={modal.orderId + (modal.unitId || 'baru')} orderId={modal.orderId} unitId={modal.unitId} onClose={close} />}
            {modal?.kind === 'rekapBaru' && <RekapBaruDialog onClose={close} />}
            {modal?.kind === 'bagikanForm' && <BagikanFormDialog onClose={close} />}
            {modal?.kind === 'kirimHarga' && <KirimHargaDialog onClose={close} />}
            {modal?.kind === 'bayarRekap' && <BayarRekapDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'stok' && <StokDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'stok-in' && <StokInDialog id={modal.id} adj={modal.adj} onClose={close} />}
            {modal?.kind === 'stok-buka' && <BukaRollDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'kar' && <KarDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'abs' && <AbsDialog id={modal.id} tanggal={modal.tanggal} onClose={close} />}
            {modal?.kind === 'akun' && <AkunDialog id={modal.id} onClose={close} />}
            {modal?.kind === 'riwayat' && <RiwayatDialog id={modal.id} month={modal.month} onClose={close} />}
            {modal?.kind === 'libur' && <LiburDialog onClose={close} />}
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
      </div>
    </div>
  );
}
