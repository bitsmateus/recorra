'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

/** Diálogo de confirmação in-app (substitui o confirm() nativo do navegador). */
export function ConfirmDialog({
  titulo,
  mensagem,
  confirmLabel = 'Confirmar',
  danger = false,
  confirmarTexto,
  onConfirm,
  onClose,
}: {
  titulo: string;
  mensagem: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Quando definido, o usuário precisa digitar exatamente este texto para liberar o botão. */
  confirmarTexto?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [digitado, setDigitado] = useState('');
  const travado = confirmarTexto ? digitado.trim() !== confirmarTexto : false;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="mb-5 text-sm text-muted">{mensagem}</div>
        {confirmarTexto && (
          <div className="mb-5">
            <label className="mb-1 block text-xs text-muted">
              Para confirmar, digite <b className="font-mono text-danger">{confirmarTexto}</b>
            </label>
            <input
              autoFocus
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !travado) onConfirm(); }}
              placeholder={confirmarTexto}
              className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-danger"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={travado}
            className={`rounded px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary-hover'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
