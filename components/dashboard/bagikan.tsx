'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { saveTemplateAjak } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { NAMA_USAHA } from '@/lib/brand';
import { useDash } from './ctx';
import { FormDialog } from './form-dialog';
import { salinWa } from './invoice';

export const TEMPLATE_AJAK =
  'Halo Bapak/Ibu, terima kasih sudah mempercayakan servis AC kepada {usaha} 🙏\n\n' +
  'Supaya kami bisa mengingatkan jadwal cuci AC rutin (setiap ±3 bulan), mohon bantu isi data singkat di link berikut (1 menit):\n{link}\n\n' +
  'Kalau repot isi form, cukup balas chat ini dengan jumlah & lokasi AC-nya (mis. "2 AC: kamar & ruang tamu"), biar kami yang catat. Terima kasih!';

/* Link + QR form daftar online, dan pesan WA (bisa diedit) untuk konsumen lama. */
export function BagikanFormDialog({ onClose }: { onClose: () => void }) {
  const { d, open, run } = useDash();
  const [svg, setSvg] = useState('');
  const [url] = useState(() => (typeof window !== 'undefined' ? `${location.origin}/daftar` : '/daftar'));
  const template = d.settings.templateAjakForm || TEMPLATE_AJAK;
  const isi = (t: string) => t.replace(/\{link\}/g, url).replace(/\{usaha\}/g, d.settings.nama || NAMA_USAHA);
  const [teks, setTeks] = useState(template);
  const [busy, setBusy] = useState(false);
  const pesan = isi(teks);
  const berubah = teks !== template;
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1 }).then(setSvg); }, [url]);

  return (
    <FormDialog wide={false} title="Bagikan form daftar konsumen" onClose={onClose}>
      <p className="hint">Kirim link ini ke konsumen lewat chat WhatsApp, atau tunjukkan/print QR-nya. Data yang masuk muncul di tab Pelanggan dengan label “Baru dari form”.</p>
      <div className="actions">
        <input className="field mono" readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={() => salinWa(url, () => open({ kind: 'text', title: 'Link form daftar', text: url }))}>Salin link</Button>
      </div>
      <div style={{ background: '#fff', borderRadius: 8, padding: 12, width: 200, alignSelf: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />

      <label className="lbl">Pesan WhatsApp (bisa diubah sesuai konsumen)
        <textarea className="field" value={teks} onChange={e => setTeks(e.target.value)} style={{ minHeight: 170 }} />
      </label>
      <p className="hint">Tulis <span className="mono">{'{link}'}</span> di tempat link form akan muncul, dan <span className="mono">{'{usaha}'}</span> untuk nama usaha. Perubahan langsung dipakai untuk pesan ini; klik “Simpan sebagai pesan bawaan” supaya dipakai seterusnya.</p>
      <div className="actions">
        <Button type="button" onClick={() => salinWa(pesan, () => open({ kind: 'text', title: 'Pesan WhatsApp', text: pesan }))}>Salin pesan</Button>
        <Button type="button" variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(pesan)}`} target="_blank" rel="noopener noreferrer" />}>Buka WhatsApp</Button>
        {berubah && <Button type="button" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); await run(saveTemplateAjak(teks), 'Pesan bawaan disimpan'); setBusy(false); }}>Simpan sebagai pesan bawaan</Button>}
        {teks !== TEMPLATE_AJAK && <Button type="button" variant="ghost" onClick={() => setTeks(TEMPLATE_AJAK)}>Kembalikan pesan awal</Button>}
        <Button type="button" variant="outline" nativeButton={false} render={<a href="/daftar" target="_blank" rel="noopener" />}>Lihat form</Button>
      </div>
      <p className="hint">Tip: di WhatsApp Business, pakai fitur <b>Daftar siaran</b> untuk mengirim pesan ke banyak konsumen sekaligus (hanya sampai ke kontak yang menyimpan nomor usaha Anda).</p>
    </FormDialog>
  );
}
