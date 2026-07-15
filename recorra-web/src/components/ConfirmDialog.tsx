'use client';

import { X } from 'lucide-react';

/** Diálogo de confirmação in-app (substitui o confirm() nativo do navegador). */
export function ConfirmDialog({
  titulo,
  mensagem,
  confirmLabel = 'Confirmar',
  danger = false,
  onConfirm,
  onClose,
}: {
  titulo: string;
  mensagem: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="mb-5 text-sm text-muted">{mensagem}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={onConfirm} className={`rounded px-5 py-2 text-sm font-medium text-white ${danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary-hover'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
