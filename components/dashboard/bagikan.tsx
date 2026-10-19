'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { NAMA_USAHA } from '@/lib/brand';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { salinWa } from './invoice';

/* Link + QR form daftar online, dan pesan WA siap kirim untuk konsumen lama. */
export function BagikanFormDialog({ onClose }: { onClose: () => void }) {
  const { open } = useDash();
  const [svg, setSvg] = useState('');
  const [url] = useState(() => (typeof window !== 'undefined' ? `${location.origin}/daftar` : '/daftar'));
  const pesan = `Halo Bapak/Ibu, terima kasih sudah mempercayakan servis AC kepada ${NAMA_USAHA} 🙏\n\n` +
    `Supaya kami bisa mengingatkan jadwal cuci AC rutin (setiap ±3 bulan), mohon bantu isi data singkat di link berikut (1 menit):\n${url}\n\n` +
    `Terima kasih!`;
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1 }).then(setSvg); }, [url]);

  return (
    <FormDialog wide={false} title="Bagikan form daftar konsumen" onClose={onClose}>
      <p className="hint">Kirim link ini ke konsumen lama lewat chat WhatsApp, atau tunjukkan/print QR-nya. Data yang masuk muncul di tab Pelanggan dengan label “Baru dari form”.</p>
      <div className="actions">
        <input className="field mono" readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={() => salinWa(url, () => open({ kind: 'text', title: 'Link form daftar', text: url }))}>Salin link</Button>
      </div>
      <div style={{ background: '#fff', borderRadius: 8, padding: 12, width: 220, alignSelf: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />
      <label className="lbl">Pesan WhatsApp untuk konsumen lama
        <textarea className="field" readOnly value={pesan} style={{ minHeight: 150 }} onFocus={e => e.currentTarget.select()} />
      </label>
      <div className="actions">
        <Button type="button" onClick={() => salinWa(pesan, () => open({ kind: 'text', title: 'Pesan WhatsApp', text: pesan }))}>Salin pesan</Button>
        <Button type="button" variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(pesan)}`} target="_blank" rel="noopener noreferrer" />}>Buka WhatsApp</Button>
        <Button type="button" variant="outline" nativeButton={false} render={<a href="/daftar" target="_blank" rel="noopener" />}>Lihat form</Button>
      </div>
      <p className="hint">Tip: di WhatsApp Business, pakai fitur <b>Daftar siaran</b> untuk mengirim pesan ini ke banyak konsumen sekaligus (hanya sampai ke kontak yang menyimpan nomor usaha Anda).</p>
    </FormDialog>
  );
}
