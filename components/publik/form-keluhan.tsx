'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { KELUHAN_AC, pesanKeluhan } from '@/lib/unit';

/* Halaman scan stiker: petugas / konsumen memilih keluhan + keterangan, lalu tombol WA membawa semuanya ke admin. */
export function FormKeluhan({ pesan, wa, label }: { pesan: string; wa: string; label: string }) {
  const [keluhan, setKeluhan] = useState<string[]>([]);
  const [ket, setKet] = useState('');
  const [pelapor, setPelapor] = useState('');
  const href = `https://wa.me/${wa}?text=${encodeURIComponent(pesanKeluhan(pesan, keluhan, ket, pelapor))}`;
  const ubah = (k: string) => setKeluhan(x => (x.includes(k) ? x.filter(y => y !== k) : [...x, k]));
  return (
    <>
      <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <b style={{ fontSize: '.92rem' }}>Keluhan AC</b> <span className="sm">(boleh pilih lebih dari satu, opsional)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {KELUHAN_AC.map(k => {
              const on = keluhan.includes(k);
              return (
                <button key={k} type="button" onClick={() => ubah(k)} aria-pressed={on}
                  style={{ border: '1px solid ' + (on ? '#1d4fc4' : 'var(--line)'), background: on ? '#1d4fc4' : 'var(--card, #fff)', color: on ? '#fff' : 'inherit',
                    fontWeight: on ? 700 : 500, borderRadius: 99, padding: '6px 12px', fontSize: '.85rem' }}>{k}</button>
              );
            })}
          </div>
        </div>
        <label className="lbl">Keterangan tambahan <span className="sm">(opsional)</span>
          <textarea className="field" value={ket} onChange={e => setKet(e.target.value)} maxLength={500} placeholder="mis. dinginnya hilang sejak kemarin sore" style={{ minHeight: 60 }} />
        </label>
        <label className="lbl">Nama pelapor <span className="sm">(opsional)</span>
          <input className="field" value={pelapor} onChange={e => setPelapor(e.target.value)} maxLength={80} placeholder="mis. Ns. Rina · Ruang Cendana" />
        </label>
      </div>
      <Button size="lg" nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />} style={{ background: '#1fa855', fontWeight: 700 }}>
        💬 {label}
      </Button>
    </>
  );
}
