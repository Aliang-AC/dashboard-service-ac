'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* Dialog form standar: Simpan / Batal, plus Hapus dua-klik (klik lagi untuk konfirmasi). */
export function FormDialog({
  title, onClose, onSubmit, onDelete, children, submitLabel = 'Simpan', wide = true,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: (form: HTMLFormElement) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  children: React.ReactNode;
  submitLabel?: string;
  wide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className={`${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] gap-0 overflow-y-auto p-0`}>
        <form
          onSubmit={async e => {
            e.preventDefault();
            if (!onSubmit) return onClose();
            setBusy(true);
            const ok = await onSubmit(e.currentTarget);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">{children}</div>
          <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3">
            <div>
              {onDelete && (
                <Button type="button" variant="destructive" disabled={busy}
                  onClick={async () => {
                    if (!armed) return setArmed(true);
                    setBusy(true);
                    const ok = await onDelete();
                    setBusy(false);
                    if (ok) onClose();
                  }}>
                  {armed ? 'Klik lagi untuk hapus' : 'Hapus'}
                </Button>
              )}
            </div>
            <div className="actions">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{onSubmit ? 'Batal' : 'Tutup'}</Button>
              {onSubmit && <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : submitLabel}</Button>}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
