'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2, CheckCircle2, Clock, XCircle, Phone, ExternalLink, Send, Pause, Play, Pause as PauseIcon, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X, History } from 'lucide-react';
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

const CARDS_POR_LOTE = 30;

const faixaLabel: Record<string, string> = { BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };
/** Data AAAA-MM-DD local (para montar o intervalo do filtro de período). */
const isoData = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Data AAAA-MM-DD do vencimento em UTC (como as datas chegam do backend). */
const vencKey = (venc: string) => venc.slice(0, 10);
type PeriodoPreset = 'hoje' | 'mes' | 'ano' | 'tudo' | 'custom';
const periodoLabel: Record<PeriodoPreset, string> = { hoje: 'Hoje', mes: 'Este mês', ano: 'Este ano', tudo: 'Todo o período', custom: 'Personalizado' };
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
  // Padrão: o mês atual (vencimentos deste mês). "Todo o período" fica a um clique.
  const [periodo, setPeriodo] = useState<{ de: string; ate: string }>(() => {
    const h = new Date();
    return { de: isoData(new Date(h.getFullYear(), h.getMonth(), 1)), ate: isoData(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  });
  const [menuPeriodo, setMenuPeriodo] = useState(false);
  const [situacao, setSituacao] = useState<'' | 'vencidas' | 'avencer'>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [somenteComCards, setSomenteComCards] = useState(true);
  const [historico, setHistorico] = useState<{ invoiceId: string; nome: string } | null>(null);
  const [visiveisPorColuna, setVisiveisPorColuna] = useState<Record<string, number>>({});
  const esteiraRef = useRef<HTMLDivElement>(null);

  const moverEsteira = (direcao: -1 | 1) => {
    esteiraRef.current?.scrollBy({ left: direcao * 300, behavior: 'smooth' });
  };

  const carregarMaisCards = (e: UIEvent<HTMLDivElement>, coluna: string, total: number) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
    setVisiveisPorColuna((atuais) => {
      const quantidade = atuais[coluna] ?? CARDS_POR_LOTE;
      if (quantidade >= total) return atuais;
      return { ...atuais, [coluna]: Math.min(quantidade + CARDS_POR_LOTE, total) };
    });
  };

  useEffect(() => {
    setVisiveisPorColuna({});
  }, [situacao, canalFiltro, periodo.de, periodo.ate, ruleId]);

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

  // Presets de período → intervalo [de, ate] aplicado sobre o vencimento do card.
  function aplicarPeriodo(p: Exclude<PeriodoPreset, 'custom'>) {
    const h = new Date();
    if (p === 'hoje') setPeriodo({ de: isoData(h), ate: isoData(h) });
    else if (p === 'mes') setPeriodo({ de: isoData(new Date(h.getFullYear(), h.getMonth(), 1)), ate: isoData(new Date(h.getFullYear(), h.getMonth() + 1, 0)) });
    else if (p === 'ano') setPeriodo({ de: isoData(new Date(h.getFullYear(), 0, 1)), ate: isoData(new Date(h.getFullYear(), 11, 31)) });
    else setPeriodo({ de: '', ate: '' });
    limpar();
  }
  const periodoAtual: PeriodoPreset = (() => {
    const h = new Date();
    const { de, ate } = periodo;
    if (!de && !ate) return 'tudo';
    if (de === isoData(h) && ate === isoData(h)) return 'hoje';
    if (de === isoData(new Date(h.getFullYear(), h.getMonth(), 1)) && ate === isoData(new Date(h.getFullYear(), h.getMonth() + 1, 0))) return 'mes';
    if (de === isoData(new Date(h.getFullYear(), 0, 1)) && ate === isoData(new Date(h.getFullYear(), 11, 31))) return 'ano';
    return 'custom';
  })();

  const passaSituacao = (card: Card) => {
    if (situacao === 'vencidas') return card.diffDias > 0;
    if (situacao === 'avencer') return card.diffDias < 0;
    return true;
  };
  const passaFiltro = (card: Card) => {
    if (canalFiltro && card.canal !== canalFiltro) return false;
    const v = vencKey(card.vencimento);
    if (periodo.de && v < periodo.de) return false;
    if (periodo.ate && v > periodo.ate) return false;
    return passaSituacao(card);
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const limpar = () => setSel(new Set());
  /** Marca/desmarca todos os ids de uma coluna de uma vez. */
  const toggleColuna = (ids: string[]) => setSel((s) => {
    const n = new Set(s);
    const todos = ids.length > 0 && ids.every((id) => n.has(id));
    ids.forEach((id) => (todos ? n.delete(id) : n.add(id)));
    return n;
  });

  async function acao(tipo: 'disparar' | 'pausar' | 'retomar', idsArg?: string[]) {
    const ids = idsArg ?? [...sel];
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

  const totalAbertas = dados?.colunas
    .filter((c) => c.key !== 'encerradas')
    .reduce((s, c) => s + c.cards.filter(passaFiltro).length, 0) ?? 0;
  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Esteira de cobrança" subtitle="Em qual etapa da régua cada fatura em aberto está agora. Selecione cards para disparar ou pausar em lote." />
        <div className="flex flex-wrap items-center gap-2">
          {dados?.regua && (
            <div className="relative">
              <button onClick={() => setMenuPeriodo((v) => !v)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${menuPeriodo || periodoAtual !== 'tudo' ? 'border-primary bg-primary-tint text-primary' : 'border-line text-ink hover:bg-canvas'}`}><CalendarDays size={15} /> {periodoLabel[periodoAtual]} <ChevronDown size={14} /></button>
              {menuPeriodo && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuPeriodo(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-lg">
                    {([['hoje', 'Hoje'], ['mes', 'Este mês'], ['ano', 'Este ano'], ['tudo', 'Todo o período']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => { aplicarPeriodo(k); setMenuPeriodo(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-primary-tint">
                        <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${periodoAtual === k ? 'border-4 border-primary' : 'border-line'}`} />
                        <span className={periodoAtual === k ? 'font-medium text-primary' : 'text-ink'}>{label}</span>
                      </button>
                    ))}
                    <div className="mt-1 rounded-md border-t border-line px-2 pb-1 pt-2">
                      <div className="mb-2 flex items-center gap-2 text-sm"><span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${periodoAtual === 'custom' ? 'border-4 border-primary' : 'border-line'}`} /> <span className={periodoAtual === 'custom' ? 'font-medium text-primary' : 'text-ink'}>Personalizado</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block"><span className="mb-1 block text-[11px] text-muted">De</span>
                          <input type="date" value={periodo.de} onChange={(e) => { setPeriodo((s) => ({ ...s, de: e.target.value })); limpar(); }} className="w-full rounded-md border border-primary/30 bg-primary-tint/30 px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                        </label>
                        <label className="block"><span className="mb-1 block text-[11px] text-muted">Até</span>
                          <input type="date" value={periodo.ate} onChange={(e) => { setPeriodo((s) => ({ ...s, ate: e.target.value })); limpar(); }} className="w-full rounded-md border border-primary/30 bg-primary-tint/30 px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
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

      {!loading && dados?.regua && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([
            ['', 'Todas'],
            ['vencidas', 'Vencidas'],
            ['avencer', 'A vencer'],
          ] as const).map(([v, label]) => (
            <button
              key={v || 'todas'}
              onClick={() => { setSituacao(v); limpar(); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${situacao === v ? 'border-primary bg-primary-tint text-primary' : 'border-line text-muted hover:bg-canvas'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin text-primary" /> Carregando...</p>}

      {!loading && dados && !dados.regua && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nenhuma régua ativa. Crie e ative uma régua em <Link href="/reguas" className="text-primary underline">Réguas</Link> para acompanhar aqui.
        </div>
      )}

      {!loading && dados?.regua && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Régua <b className="text-ink">{dados.regua.nome}</b> · <b className="text-ink">{totalAbertas}</b> fatura(s) em aberto.</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={somenteComCards}
                onClick={() => setSomenteComCards((v) => !v)}
                className="flex select-none items-center gap-2 text-xs font-medium text-muted"
              >
                <span className={`relative h-5 w-9 rounded-full transition ${somenteComCards ? 'bg-primary' : 'bg-line'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${somenteComCards ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
                Só com faturas
              </button>
              <div className="flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
                <button
                  type="button"
                  onClick={() => moverEsteira(-1)}
                  aria-label="Mover esteira para a esquerda"
                  title="Mover para a esquerda"
                  className="flex h-8 w-9 items-center justify-center text-muted transition hover:bg-canvas hover:text-primary active:bg-primary-tint"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => moverEsteira(1)}
                  aria-label="Mover esteira para a direita"
                  title="Mover para a direita"
                  className="flex h-8 w-9 items-center justify-center border-l border-line text-muted transition hover:bg-canvas hover:text-primary active:bg-primary-tint"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
          <div ref={esteiraRef} className="overflow-x-auto pb-3">
            <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
              {dados.colunas
                .filter((c) => !somenteComCards || c.cards.some(passaFiltro))
                .map((c) => {
                const cards = c.cards.filter(passaFiltro);
                const quantidadeVisivel = visiveisPorColuna[c.key] ?? CARDS_POR_LOTE;
                const selecionavelCol = c.key !== 'encerradas' && c.key !== 'sem-contato';
                const idsCol = selecionavelCol ? cards.map((x) => x.invoiceId) : [];
                const todosCol = idsCol.length > 0 && idsCol.every((id) => sel.has(id));
                return (
                  <div key={c.key} className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-canvas">
                    <div className="rounded-t-lg border-t-4 bg-surface px-3 py-2.5" style={{ borderTopColor: corDaColuna(c.key) }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {selecionavelCol && idsCol.length > 0 && (
                            <input type="checkbox" checked={todosCol} onChange={() => toggleColuna(idsCol)} title="Selecionar todos desta coluna" className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                          )}
                          <span className="truncate text-sm font-semibold text-ink">{c.label}</span>
                        </div>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">{cards.length}</span>
                      </div>
                      {c.key === 'falharam' && idsCol.length > 0 && (
                        <button onClick={() => acao('disparar', idsCol)} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-[#C8392F]/40 bg-danger-tint px-2 py-1 text-xs font-medium text-[#A32D2D] hover:opacity-90 disabled:opacity-60"><Send size={12} /> Reenviar todos</button>
                      )}
                    </div>
                    <div
                      onScroll={(e) => carregarMaisCards(e, c.key, cards.length)}
                      className="flex-1 space-y-2 overflow-y-auto p-2"
                      style={{ maxHeight: 'calc(100vh - 260px)' }}
                    >
                      {cards.slice(0, quantidadeVisivel).map((card) => {
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
                                : card.ultimoDisparo
                                  ? <button type="button" onClick={(e) => { e.stopPropagation(); setHistorico({ invoiceId: card.invoiceId, nome: card.nome }); }} title="Ver o que foi enviado e quando" className="flex items-center gap-1 rounded hover:underline">{disparoBadge(card.ultimoDisparo.status)}</button>
                                  : <span className="text-muted">sem toque ainda</span>}
                            </div>
                            {card.pausada && <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[#854F0B]"><PauseIcon size={11} /> cobrança pausada</div>}
                          </div>
                        );
                      })}
                      {cards.length > quantidadeVisivel && (
                        <div className="px-1 py-2 text-center text-xs text-muted">
                          Role para carregar mais · {cards.length - quantidadeVisivel} restante(s)
                        </div>
                      )}
                      {cards.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {historico && <HistoricoModal invoiceId={historico.invoiceId} nome={historico.nome} onClose={() => setHistorico(null)} />}

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

interface DisparoHist {
  id: string;
  canal: string;
  canalNome: string | null;
  origem: string | null;
  conteudo: string | null;
  status: string;
  erro: string | null;
  enviadoEm: string | null;
  agendadoPara: string | null;
  createdAt: string;
}

/** Qual data mostrar e como chamá-la, conforme o estado do disparo. */
function quandoDoDisparo(d: DisparoHist): { label: string; valor: string | null } {
  if (['ENVIADO', 'ENTREGUE', 'LIDO'].includes(d.status)) return { label: 'Enviado em', valor: d.enviadoEm ?? d.createdAt };
  if (d.status === 'FILA') return { label: 'Agendado para', valor: d.agendadoPara ?? d.createdAt };
  return { label: 'Registrado em', valor: d.createdAt };
}

const statusHist: Record<string, { txt: string; cls: string }> = {
  ENVIADO: { txt: 'Enviado', cls: 'bg-success-tint text-[#0F6E56]' },
  ENTREGUE: { txt: 'Entregue', cls: 'bg-success-tint text-[#0F6E56]' },
  LIDO: { txt: 'Lido', cls: 'bg-success-tint text-[#0F6E56]' },
  FILA: { txt: 'Na fila', cls: 'bg-warning-tint text-[#854F0B]' },
  FALHA: { txt: 'Falhou', cls: 'bg-danger-tint text-[#A32D2D]' },
  IGNORADO: { txt: 'Ignorado', cls: 'bg-canvas text-muted' },
};
const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** Histórico de disparos de uma fatura (abre ao clicar no selo do card). */
function HistoricoModal({ invoiceId, nome, onClose }: { invoiceId: string; nome: string; onClose: () => void }) {
  const [rows, setRows] = useState<DisparoHist[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<{ rows: DisparoHist[] }>(`/disparos/fatura/${invoiceId}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar'));
  }, [invoiceId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><History size={17} className="text-primary" /> Envios de {nome}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!rows && !erro && <p className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 size={15} className="animate-spin text-primary" /> Carregando...</p>}
          {erro && <p className="py-6 text-sm text-danger">{erro}</p>}
          {rows && rows.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhum disparo registrado para esta fatura ainda.</p>}
          {rows && rows.length > 0 && (
            <ol className="space-y-3">
              {rows.map((d) => {
                const s = statusHist[d.status] ?? { txt: d.status, cls: 'bg-canvas text-muted' };
                return (
                  <li key={d.id} className="rounded-lg border border-line bg-canvas p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${s.cls}`}>{s.txt}</span>
                      <span className="font-medium text-ink">{canalLabel[d.canal] || d.canal}{d.canalNome ? ` · ${d.canalNome}` : ''}</span>
                      {d.origem && <span className="text-muted">· {d.origem}</span>}
                      {(() => { const q = quandoDoDisparo(d); return <span className="ml-auto text-muted">{q.label} {dataHora(q.valor)}</span>; })()}
                    </div>
                    {d.conteudo && <p className="whitespace-pre-wrap break-words rounded bg-surface p-2 text-sm text-ink">{d.conteudo}</p>}
                    {d.erro && <p className="mt-1.5 rounded bg-danger-tint px-2 py-1 text-xs text-[#A32D2D]"><b>Erro:</b> {d.erro}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
