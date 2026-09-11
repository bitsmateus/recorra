'use client';

import { useEffect, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';

interface Nota { id: string; texto: string; createdAt: string; user?: { nome: string } | null }

const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Anotações manuais de interação com o cliente (ligação, combinado, acordo verbal
 * etc.) — sem alterar fatura/cadastro. Usado tanto no perfil do cliente quanto
 * direto no card da esteira (dentro de um modal), sem precisar abrir o cadastro.
 */
export function NotasCliente({ customerId }: { customerId: string }) {
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    api<Nota[]>(`/clientes/${customerId}/notas`).then(setNotas).catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar notas'));
  }, [customerId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo) return;
    setBusy(true); setErro('');
    try {
      await api(`/clientes/${customerId}/notas`, { method: 'POST', body: { texto: limpo } });
      setTexto('');
      carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar nota'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex gap-2 p-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar(); }}
          placeholder="Registrar ligação, combinado, promessa de pagamento..."
          rows={2}
          className="flex-1 resize-none rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button onClick={enviar} disabled={busy || !texto.trim()} title="Salvar nota (Ctrl+Enter)" className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-60">
          <Send size={15} />
        </button>
      </div>
      {erro && <p className="px-2 text-sm text-danger">{erro}</p>}
      <div className="max-h-64 overflow-auto">
        {notas === null && !erro && <p className="px-2 py-4 text-center text-sm text-muted">Carregando...</p>}
        {notas?.map((n) => (
          <div key={n.id} className="border-b border-line px-2 py-2 last:border-0">
            <div className="text-xs text-muted">{n.user?.nome ?? 'Usuário removido'} · {dataHora(n.createdAt)}</div>
            <div className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{n.texto}</div>
          </div>
        ))}
        {notas?.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhuma nota ainda.</p>}
      </div>
    </div>
  );
}
