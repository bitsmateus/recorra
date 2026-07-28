'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2, CheckCircle2, Clock, XCircle, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';

interface Card {
  invoiceId: string; customerId: string; nome: string; valor: number;
  vencimento: string; diffDias: number;
  ultimoDisparo: { status: string; canal: string; quando: string } | null;
  status?: string;
}
interface Coluna { key: string; label: string; cards: Card[]; total: number; valor: number }
interface Andamento {
  regua: { id: string; nome: string } | null;
  reguas: { id: string; nome: string; faixaRisco?: string | null }[];
  usarFaixaRisco: boolean;
  colunas: Coluna[];
}

const faixaLabel: Record<string, string> = { BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };

/** Cor do topo da coluna conforme a fase (antes/no dia/depois/encerrada/sem contato). */
function corDaColuna(key: string): string {
  if (key === 'aguardando') return '#9aa8a3';
  if (key === 'encerradas') return '#12925b';
  if (key === 'sem-contato') return '#C88A2E';
  if (key.startsWith('step:')) {
    const o = Number(key.slice(5));
    if (o < 0) return '#7C3AED'; // antes do vencimento
    if (o === 0) return '#14857C'; // no dia
    return '#E07A2C'; // depois (atraso)
  }
  return '#9aa8a3';
}

function prazoLabel(diff: number): { txt: string; cls: string } {
  if (diff < 0) return { txt: `vence em ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''}`, cls: 'text-muted' };
  if (diff === 0) return { txt: 'vence hoje', cls: 'text-[#854F0B]' };
  return { txt: `vencida há ${diff} dia${diff > 1 ? 's' : ''}`, cls: 'text-[#A32D2D]' };
}

/** Ícone + rótulo do status do último disparo. */
function disparoBadge(status: string) {
  if (['ENVIADO', 'ENTREGUE', 'LIDO'].includes(status)) return <span className="flex items-center gap-1 text-[#0F6E56]"><CheckCircle2 size={12} /> enviado</span>;
  if (status === 'FILA') return <span className="flex items-center gap-1 text-[#854F0B]"><Clock size={12} /> na fila</span>;
  return <span className="flex items-center gap-1 text-[#A32D2D]"><XCircle size={12} /> falhou</span>;
}

export default function AndamentoPage() {
  const [dados, setDados] = useState<Andamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [ruleId, setRuleId] = useState('');

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const q = ruleId ? `?ruleId=${ruleId}` : '';
    const r = await api<Andamento>(`/reguas/andamento${q}`).catch(() => null);
    if (r) { setDados(r); if (!ruleId && r.regua) setRuleId(r.regua.id); }
    if (!silencioso) setLoading(false);
  }, [ruleId]);

  useEffect(() => { carregar(); }, [carregar]);
  // Atualiza sozinho a cada 30s (as etapas andam conforme o tempo/disparos).
  useEffect(() => { const t = setInterval(() => carregar(true), 30000); return () => clearInterval(t); }, [carregar]);

  const totalAbertas = dados?.colunas.filter((c) => c.key !== 'encerradas').reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Andamento da cobrança" subtitle="Em qual etapa da régua cada fatura em aberto está agora. Os cards andam sozinhos conforme o tempo passa e os disparos saem." />
        <div className="flex items-center gap-2">
          {dados && dados.reguas.length > 1 && (
            <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary">
              {dados.reguas.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.faixaRisco ? ` · ${faixaLabel[r.faixaRisco] || r.faixaRisco}` : ''}</option>)}
            </select>
          )}
          <button onClick={() => carregar()} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas"><RefreshCw size={15} /> Atualizar</button>
        </div>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin text-primary" /> Carregando...</p>}

      {!loading && dados && !dados.regua && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nenhuma régua ativa. Crie e ative uma régua em <Link href="/reguas" className="text-primary underline">Réguas</Link> para acompanhar o andamento aqui.
        </div>
      )}

      {!loading && dados?.regua && (
        <>
          <p className="mb-3 text-sm text-muted">
            Régua <b className="text-ink">{dados.regua.nome}</b> · <b className="text-ink">{totalAbertas}</b> fatura(s) em aberto no fluxo.
          </p>
          <div className="overflow-x-auto pb-3">
            <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
              {dados.colunas.map((c) => (
                <div key={c.key} className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-canvas">
                  <div className="rounded-t-lg border-t-4 bg-surface px-3 py-2.5" style={{ borderTopColor: corDaColuna(c.key) }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{c.label}</span>
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">{c.total}</span>
                    </div>
                    {c.valor > 0 && <div className="tabular mt-0.5 text-xs text-muted">{brl(c.valor)}</div>}
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                    {c.cards.slice(0, 100).map((card) => {
                      const p = prazoLabel(card.diffDias);
                      return (
                        <Link key={card.invoiceId} href={`/clientes/${card.customerId}`} className="block rounded-lg border border-line bg-surface p-2.5 shadow-sm transition hover:border-primary/50 hover:shadow">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate text-sm font-medium text-ink" title={card.nome}>{card.nome}</span>
                            <span className="tabular shrink-0 text-sm font-semibold text-ink">{brl(card.valor)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                            {c.key === 'encerradas'
                              ? <span className={`rounded-full px-2 py-0.5 font-medium ${card.status === 'PAGA' ? 'bg-success-tint text-[#0F6E56]' : 'bg-canvas text-muted'}`}>{card.status === 'PAGA' ? 'Paga' : 'Cancelada'}</span>
                              : <span className={p.cls}>{p.txt}</span>}
                            {c.key === 'sem-contato'
                              ? <span className="flex items-center gap-1 text-[#854F0B]"><Phone size={12} /> sem telefone/e-mail</span>
                              : card.ultimoDisparo ? disparoBadge(card.ultimoDisparo.status) : <span className="text-muted">sem toque ainda</span>}
                          </div>
                        </Link>
                      );
                    })}
                    {c.cards.length > 100 && <div className="px-1 py-1 text-center text-xs text-muted">+{c.cards.length - 100} não mostrados</div>}
                    {c.cards.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted">—</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
