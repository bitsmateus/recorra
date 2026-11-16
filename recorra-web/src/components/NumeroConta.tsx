'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

/** Número/identificação da conta (ex.: linha 1000): aparece nos disparos e no relatório por número. */
export function NumeroConta({ c }: { c: { id: string; numero?: string | null } }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(c.numero ?? '');
  const [salvo, setSalvo] = useState(c.numero ?? '');
  async function salvar() {
    const r = await api<{ numero: string | null }>(`/canais/${c.id}/numero`, { method: 'PUT', body: { numero: valor } }).catch(() => null);
    if (r) setSalvo(r.numero ?? '');
    setEditando(false);
  }
  if (editando) {
    return (
      <div className="mb-2 flex items-center gap-1.5">
        <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
          placeholder="Ex.: 1000 ou (11) 3000-0000" aria-label="Número da conta" className="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:border-primary" />
        <button onClick={salvar} className="rounded bg-primary px-2 py-1 text-xs font-medium text-white">OK</button>
      </div>
    );
  }
  return (
    <button onClick={() => { setValor(salvo); setEditando(true); }} className="mb-2 block text-left text-xs text-muted hover:text-primary" title="Número exibido nos disparos e relatórios">
      {salvo ? <>Número: <b className="text-ink">{salvo}</b></> : '+ informar número'}
    </button>
  );
}
