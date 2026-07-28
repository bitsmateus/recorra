'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2, CheckCircle2, Clock, XCircle, Phone, ExternalLink, Send, Pause, Play, Pause as PauseIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';

interface Card {
  invoiceId: string; customerId: string; nome: string; valor: number;
  vencimento: string; diffDias: number;
  ultimoDisparo: { status: string; canal: string; quando: string } | null;
  canal?: string; pausada?: boolean; status?: string;
}
interface Coluna { key: string; label: string; cards: Card[]; total: number; valor: number }
interface Andamento {
  regua: { id: string; nome: string } | null;
  reguas: { id: string; nome: string; faixaRisco?: string | null }[];
  usarFaixaRisco: boolean;
  colunas: Coluna[];
}

const faixaLabel: Record<string, string> = { BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };
const canalLabel: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp', NX_SYSTEMS: 'WhatsApp oficial', WHATSAPP_EVOLUTION: 'WhatsApp', WHATSAPP_UAZAPI: 'WhatsApp',
  EMAIL: 'E-mail', SMS: 'SMS', HTTP_GENERIC: 'API',
};

function corDaColuna(key: string): string {
  if (key === 'aguardando') return '#9aa8a3';
  if (key === 'falharam') return '#C8392F';
  if (key === 'encerradas') return '#12925b';
  if (key === 'sem-contato') return '#C88A2E';
  if (key.startsWith('step:')) {
    const o = Number(key.slice(5));
    if (o < 0) return '#7C3AED';
    if (o === 0) return '#14857C';
    return '#E07A2C';
  }
  return '#9aa8a3';
}
function prazoLabel(diff: number): { txt: string; cls: string } {
  if (diff < 0) return { txt: `vence em ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''}`, cls: 'text-muted' };
  if (diff === 0) return { txt: 'vence hoje', cls: 'text-[#854F0B]' };
  return { txt: `vencida há ${diff} dia${diff > 1 ? 's' : ''}`, cls: 'text-[#A32D2D]' };
}
function disparoBadge(status: string) {
  if (['ENVIADO', 'ENTREGUE', 'LIDO'].includes(status)) return <span className="flex items-center gap-1 text-[#0F6E56]"><CheckCircle2 size={12} /> enviado</span>;
  if (status === 'FILA') return <span className="flex items-center gap-1 text-[#854F0B]"><Clock size={12} /> na fila</span>;
  return <span className="flex items-center gap-1 text-[#A32D2D]"><XCircle size={12} /> falhou</span>;
}

export default function AndamentoPage() {
  const [dados, setDados] = useState<Andamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [ruleId, setRuleId] = useState('');
  const [canalFiltro, setCanalFiltro] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const q = ruleId ? `?ruleId=${ruleId}` : '';
    const r = await api<Andamento>(`/reguas/andamento${q}`).catch(() => null);
    if (r) { setDados(r); if (!ruleId && r.regua) setRuleId(r.regua.id); }
    if (!silencioso) setLoading(false);
  }, [ruleId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { const t = setInterval(() => carregar(true), 30000); return () => clearInterval(t); }, [carregar]);

  const canaisDisponiveis = useMemo(() => {
    const s = new Set<string>();
    dados?.colunas.forEach((c) => c.cards.forEach((x) => x.canal && s.add(x.canal)));
    return [...s];
  }, [dados]);

  const passaFiltro = (card: Card) => !canalFiltro || card.canal === canalFiltro;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const limpar = () => setSel(new Set());

  async function acao(tipo: 'disparar' | 'pausar' | 'retomar') {
    const ids = [...sel];
    if (!ids.length) return;
    setBusy(true); setMsg('');
    try {
      if (tipo === 'disparar') {
        const r = await api<{ enfileirados: number; falhas: number }>('/reguas/andamento/disparar', { method: 'POST', body: { invoiceIds: ids } });
        setMsg(`✓ ${r.enfileirados} disparo(s) na fila${r.falhas ? ` · ${r.falhas} falharam` : ''}.`);
      } else {
        const r = await api<{ alteradas: number }>('/reguas/andamento/pausar', { method: 'POST', body: { invoiceIds: ids, pausar: tipo === 'pausar' } });
        setMsg(`✓ ${r.alteradas} cobrança(s) ${tipo === 'pausar' ? 'pausada(s)' : 'retomada(s)'}.`);
      }
      limpar(); carregar(true);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro na ação'); }
    setBusy(false);
  }

  const totalAbertas = dados?.colunas.filter((c) => c.key !== 'encerradas').reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Esteira de cobrança" subtitle="Em qual etapa da régua cada fatura em aberto está agora. Selecione cards para disparar ou pausar em lote." />
        <div className="flex flex-wrap items-center gap-2">
          {canaisDisponiveis.length > 1 && (
            <select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="">Todos os canais</option>
              {canaisDisponiveis.map((c) => <option key={c} value={c}>{canalLabel[c] || c}</option>)}
            </select>
          )}
          {dados && dados.reguas.length > 1 && (
            <select value={ruleId} onChange={(e) => { setRuleId(e.target.value); limpar(); }} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary">
              {dados.reguas.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.faixaRisco ? ` · ${faixaLabel[r.faixaRisco] || r.faixaRisco}` : ''}</option>)}
            </select>
          )}
          <button onClick={() => carregar()} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas"><RefreshCw size={15} /> Atualizar</button>
        </div>
      </div>

      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin text-primary" /> Carregando...</p>}

      {!loading && dados && !dados.regua && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nenhuma régua ativa. Crie e ative uma régua em <Link href="/reguas" className="text-primary underline">Réguas</Link> para acompanhar aqui.
        </div>
      )}

      {!loading && dados?.regua && (
        <>
          <p className="mb-3 text-sm text-muted">Régua <b className="text-ink">{dados.regua.nome}</b> · <b className="text-ink">{totalAbertas}</b> fatura(s) em aberto.</p>
          <div className="overflow-x-auto pb-3">
            <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
              {dados.colunas.map((c) => {
                const cards = c.cards.filter(passaFiltro);
                return (
                  <div key={c.key} className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-canvas">
                    <div className="rounded-t-lg border-t-4 bg-surface px-3 py-2.5" style={{ borderTopColor: corDaColuna(c.key) }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">{c.label}</span>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">{cards.length}</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                      {cards.slice(0, 100).map((card) => {
                        const p = prazoLabel(card.diffDias);
                        const marcado = sel.has(card.invoiceId);
                        const selecionavel = c.key !== 'encerradas' && c.key !== 'sem-contato';
                        return (
                          <div
                            key={card.invoiceId}
                            onClick={() => selecionavel && toggle(card.invoiceId)}
                            className={`rounded-lg border bg-surface p-2.5 shadow-sm transition ${selecionavel ? 'cursor-pointer' : ''} ${marcado ? 'border-primary ring-1 ring-primary/40' : 'border-line hover:border-primary/40'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                {selecionavel && <input type="checkbox" checked={marcado} onChange={() => toggle(card.invoiceId)} onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary" />}
                                <span className="truncate text-sm font-medium text-ink" title={card.nome}>{card.nome}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="tabular text-sm font-semibold text-ink">{brl(card.valor)}</span>
                                <Link href={`/clientes/${card.customerId}`} onClick={(e) => e.stopPropagation()} title="Abrir cliente" className="text-muted hover:text-primary"><ExternalLink size={13} /></Link>
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                              {c.key === 'encerradas'
                                ? <span className={`rounded-full px-2 py-0.5 font-medium ${card.status === 'PAGA' ? 'bg-success-tint text-[#0F6E56]' : 'bg-canvas text-muted'}`}>{card.status === 'PAGA' ? 'Paga' : 'Cancelada'}</span>
                                : <span className={p.cls}>{p.txt}</span>}
                              {c.key === 'sem-contato'
                                ? <span className="flex items-center gap-1 text-[#854F0B]"><Phone size={12} /> sem contato</span>
                                : card.ultimoDisparo ? disparoBadge(card.ultimoDisparo.status) : <span className="text-muted">sem toque ainda</span>}
                            </div>
                            {card.pausada && <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[#854F0B]"><PauseIcon size={11} /> cobrança pausada</div>}
                          </div>
                        );
                      })}
                      {cards.length > 100 && <div className="px-1 py-1 text-center text-xs text-muted">+{cards.length - 100} não mostrados</div>}
                      {cards.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{sel.size} selecionada(s)</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={() => acao('disparar')} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><Send size={14} /> Disparar agora</button>
              <button onClick={() => acao('pausar')} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas disabled:opacity-60"><Pause size={14} /> Pausar cobrança</button>
              <button onClick={() => acao('retomar')} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas disabled:opacity-60"><Play size={14} /> Retomar</button>
              <button onClick={limpar} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink">Limpar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
