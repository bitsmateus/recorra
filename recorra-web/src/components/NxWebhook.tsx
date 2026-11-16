'use client';

import { useState } from 'react';
import { Copy, Link2, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Eventos {
  transferencias: { quando: string; ticketId: string; fila: number; motivo: string | null; cliente: string | null }[];
  contatos: { quando: string; cliente: string; atendente: string; texto: string | null }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
// Os webhooks ficam fora do prefixo /api (igual aos de gateway).
const hostApi = API_URL.replace(/\/api\/?$/, '');
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Botão + janela do webhook do chat NX de uma conta: a URL para colar no NX e o
 * que ele já fez (transferências de fila e conversas das atendentes registradas).
 */
export function NxWebhook({ conta }: { conta: { id: string; apelido: string } }) {
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState('');
  const [eventos, setEventos] = useState<Eventos | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function carregar(novo = false) {
    setBusy(true); setMsg('');
    try {
      const r = await api<{ caminho: string }>(`/canais/${conta.id}/webhook-nx`, { method: 'POST', body: { novo } });
      setUrl(`${hostApi}${r.caminho}`);
      setEventos(await api<Eventos>(`/canais/${conta.id}/webhook-nx/eventos`));
      if (novo) setMsg('Novo endereço gerado. Atualize no NX: o anterior parou de funcionar.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(url); setMsg('Endereço copiado.'); } catch { setMsg('Copie manualmente o endereço acima.'); }
  }

  return (
    <>
      <button onClick={() => { setAberto(true); carregar(); }} className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        <Link2 size={12} /> Webhook do chat (fila + contato manual)
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAberto(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Webhook do chat NX · {conta.apelido}</h2>
              <button onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
            </div>
            <p className="mb-3 text-sm text-muted">
              Cole este endereço no NX, na conexão deste número (Integrações → Webhook, evento de mensagens). Com ele o Recorrai:
            </p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-ink">
              <li><b>Quando o cliente responde</b>, transfere o atendimento para a fila da operadora responsável (ou da carteira dele). Só clientes com fatura vencida, uma vez por atendimento, e nunca se já houver atendente no ticket.</li>
              <li><b>Quando a atendente escreve no chat</b>, registra a conversa como contato manual dela (um por atendimento por dia), e ela entra no relatório de recuperação.</li>
            </ul>
            <p className="mb-3 text-xs text-muted">
              Configure as filas em Réguas → Carteiras (fila da equipe) e em Equipe (ID do usuário no NX e fila pessoal).
            </p>
            <div className="mb-2 flex items-center gap-2">
              <input readOnly value={busy && !url ? 'Gerando…' : url} aria-label="Endereço do webhook" className="min-w-0 flex-1 rounded border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink" />
              <button onClick={copiar} disabled={!url} className="flex items-center gap-1 rounded bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-60"><Copy size={13} /> Copiar</button>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
              <button onClick={() => { if (window.confirm('Gerar um novo endereço? O atual para de funcionar até você atualizar no NX.')) carregar(true); }} disabled={busy} className="flex items-center gap-1 text-muted hover:text-danger"><RefreshCw size={12} /> Gerar novo endereço</button>
              <span className="text-muted">O endereço contém um código secreto: compartilhe só com quem configura o NX.</span>
            </div>
            {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted">Últimas transferências de fila</div>
                {eventos?.transferencias.length ? eventos.transferencias.map((t) => (
                  <div key={t.ticketId} className="border-b border-line py-1.5 text-xs last:border-0">
                    <span className="text-muted">{dataHora(t.quando)}</span> · <b className="text-ink">{t.cliente ?? '—'}</b> → fila {t.fila}
                    <span className="text-muted"> ({t.motivo === 'responsavel' ? 'da responsável' : 'da carteira'}, atendimento #{t.ticketId})</span>
                  </div>
                )) : <p className="text-xs text-muted">Nenhuma ainda.</p>}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted">Últimas conversas das atendentes</div>
                {eventos?.contatos.length ? eventos.contatos.map((c, i) => (
                  <div key={i} className="border-b border-line py-1.5 text-xs last:border-0">
                    <span className="text-muted">{dataHora(c.quando)}</span> · <b className="text-ink">{c.atendente}</b> com {c.cliente}
                    {c.texto && <div className="line-clamp-1 text-muted">{c.texto}</div>}
                  </div>
                )) : <p className="text-xs text-muted">Nenhuma ainda.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
