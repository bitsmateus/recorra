'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, Pencil, Trash2, X, Filter, Plus, FileSpreadsheet, FileDown, ChevronDown, ChevronUp, ArrowUpDown, Receipt, Copy, ExternalLink, Check, HelpCircle, RefreshCw } from 'lucide-react';
import { ImportWizard } from '@/components/ImportWizard';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toCsv, baixarArquivo } from '@/lib/csv';

// Aceita valor em formato BR (109,90 ou 1.109,90) ou com ponto decimal (109.90).
function parseValorBR(v: string): number {
  const s = String(v).trim();
  if (!s) return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}

interface Invoice {
  id: string;
  valor: number;
  vencimento: string;
  status: string;
  gestaoCobranca: 'ATIVA' | 'LEGADO' | 'PAUSADA';
  metodo: string;
  descricao?: string;
  origem?: string;
  pixCopiaCola?: string;
  boletoLinha?: string;
  boletoUrl?: string;
  linkPagamento?: string;
  externalId?: string;
  customer?: { nome: string; doc: string };
}
interface Gateway { id: string; provider: string; ambiente: string; apelido?: string; importLookbackDays?: number | null }

const statusColor: Record<string, string> = {
  PENDENTE: 'bg-warning-tint text-[#854F0B]',
  VENCIDA: 'bg-danger-tint text-[#A32D2D]',
  PAGA: 'bg-success-tint text-[#0F6E56]',
  CANCELADA: 'bg-canvas text-muted',
  ESTORNADA: 'bg-canvas text-muted',
};

const emptyFiltros = { q: '', status: '', metodo: '', geracao: '', de: '', ate: '', valorMin: '', valorMax: '', etiqueta: '' };

/** Ajuda contextual aberta por clique ao lado do filtro de status. */
function AjudaStatus() {
  const [aberta, setAberta] = useState(false);
  const itens: { badge: string; txt: string }[] = [
    { badge: 'PENDENTE', txt: 'Criada e ainda no prazo — o cliente não pagou, mas também não venceu.' },
    { badge: 'VENCIDA', txt: 'Passou do vencimento sem pagamento. É o foco da régua de cobrança.' },
    { badge: 'PAGA', txt: 'O cliente pagou. A baixa é automática quando o gateway confirma.' },
    { badge: 'CANCELADA', txt: 'Cancelada — não será mais cobrada.' },
    { badge: 'ESTORNADA', txt: 'O pagamento foi devolvido ao cliente.' },
    { badge: 'LEGADO', txt: 'Cobrança antiga mantida para histórico e conciliação. Pode receber baixa quando paga, mas não entra em réguas, campanhas automáticas nem na inadimplência operacional atual.' },
  ];
  return (
    <div className="inline-flex shrink-0">
      <button type="button" onClick={() => setAberta((v) => !v)} aria-label="Entenda os status das cobranças" aria-expanded={aberta} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-primary-tint hover:text-primary">
        <HelpCircle size={14} />
      </button>
      {aberta && (
        <>
          <button type="button" aria-label="Fechar ajuda" onClick={() => setAberta(false)} className="fixed inset-0 z-40 cursor-default bg-black/10" />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 text-left normal-case shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink"><HelpCircle size={15} className="text-primary" /> Entenda os status</h2>
              <button type="button" onClick={() => setAberta(false)} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Fechar"><X size={15} /></button>
            </div>
            <div className="space-y-2">
              {itens.map((it) => (
                <div key={it.badge} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 font-medium ${statusColor[it.badge] || 'bg-canvas text-muted'}`}>{it.badge}</span>
                  <span className="pt-0.5 font-normal text-muted">{it.txt}</span>
                </div>
              ))}
              <p className="border-t border-line pt-2 text-xs font-normal text-muted">
                Legado é uma classificação de gestão exibida junto do status financeiro; uma cobrança pode ser, por exemplo, VENCIDA e LEGADO ao mesmo tempo.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ResumoCobrancas {
  total: number; soma: number; emAberto: number; ticketMedio: number; clientesDistintos: number;
  critico: { n: number; valor: number }; porStatus: Record<string, { n: number; valor: number }>;
}

export default function CobrancasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const POR_PAGINA = 50;
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [resumo, setResumo] = useState<ResumoCobrancas | null>(null);
  const [ordenacao, setOrdenacao] = useState<{ campo: 'valor' | 'vencimento' | null; dir: 'asc' | 'desc' }>({ campo: null, dir: 'asc' });
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [filtros, setFiltros] = useState(emptyFiltros);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editar, setEditar] = useState<Invoice | null>(null);
  const [excluir, setExcluir] = useState<Invoice | null>(null);
  const [confirmarImport, setConfirmarImport] = useState(false);
  const [confirmarLimparPagas, setConfirmarLimparPagas] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [pagamento, setPagamento] = useState<Invoice | null>(null);
  const toggleSel = (id: string) => setSelecionados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [criar, setCriar] = useState(false);
  const [menuImport, setMenuImport] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [etiquetas, setEtiquetas] = useState<{ nome: string }[]>([]);
  const setF = (k: string, v: string) => setFiltros((s) => ({ ...s, [k]: v }));

  const paramsFiltros = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v));
    return params;
  }, [filtros]);

  // Paginação de SERVIDOR: cada carga traz uma página (skip/take) + o total do filtro.
  // "Ver mais" acumula a próxima página; o resumo é agregado sobre a base inteira.
  // `seq` invalida respostas obsoletas: toda nova busca (filtro/ordem) incrementa;
  // uma resposta que chega depois de trocar o contexto é descartada.
  const seq = useRef(0);
  const [carregandoMais, setCarregandoMais] = useState(false);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const p = paramsFiltros();
    p.set('page', '1'); p.set('pageSize', String(POR_PAGINA));
    if (ordenacao.campo) { p.set('sortCampo', ordenacao.campo); p.set('sortDir', ordenacao.dir); }
    const [lista, res] = await Promise.all([
      api<{ items: Invoice[]; total: number }>(`/cobrancas?${p.toString()}`).catch(() => null),
      api<ResumoCobrancas>(`/cobrancas/resumo?${paramsFiltros().toString()}`).catch(() => null),
    ]);
    if (seq.current !== my) return; // superada por outra busca
    if (lista) { setInvoices(lista.items); setTotal(lista.total); setPagina(1); }
    setResumo(res);
  }, [paramsFiltros, ordenacao]);

  async function verMais() {
    if (carregandoMais) return; // evita duplo-clique pedir a mesma página
    const my = seq.current;
    const prox = pagina + 1;
    const p = paramsFiltros();
    p.set('page', String(prox)); p.set('pageSize', String(POR_PAGINA));
    if (ordenacao.campo) { p.set('sortCampo', ordenacao.campo); p.set('sortDir', ordenacao.dir); }
    setCarregandoMais(true);
    const r = await api<{ items: Invoice[]; total: number }>(`/cobrancas?${p.toString()}`).catch(() => null);
    setCarregandoMais(false);
    if (seq.current !== my) return; // contexto mudou enquanto carregava → descarta
    if (r) { setInvoices((prev) => [...prev, ...r.items]); setTotal(r.total); setPagina(prox); }
  }

  useEffect(() => { load(); }, [load]);
  // Some da seleção quem saiu da lista (excluída ou filtrada) no recarregamento.
  useEffect(() => { setSelecionados((s) => new Set([...s].filter((id) => invoices.some((i) => i.id === id)))); }, [invoices]);
  useEffect(() => {
    api<Gateway[]>('/config/gateways').then((gws) => {
      setGateways(gws);
    }).catch(() => setGateways([]));
    api<{ nome: string }[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([]));
  }, []);

  async function reavaliarStatus() {
    setMsg('Reavaliando situações...');
    const r = await api<{ atualizadas: number }>('/cobrancas/reavaliar-status', { method: 'POST' }).catch(() => null);
    if (!r) { setMsg('Erro ao reavaliar status.'); return; }
    setMsg(r.atualizadas > 0 ? `✓ ${r.atualizadas} cobrança(s) atualizada(s) para Vencida.` : '✓ Nada a atualizar — nenhuma pendente já vencida.');
    load();
  }

  async function excluirLote() {
    setMsg('Excluindo...');
    const r = await api<{ excluidas: number; total: number }>('/cobrancas/excluir-lote', { method: 'POST', body: { invoiceIds: [...selecionados] } }).catch(() => null);
    setSelecionados(new Set());
    setConfirmarLote(false);
    setMsg(r ? `✓ ${r.excluidas} cobrança(s) excluída(s) do Recorrai.` : 'Erro ao excluir.');
    load();
  }

  async function limparPagasImportadas() {
    setBusy(true); setMsg('Limpando cobranças pagas importadas...');
    try {
      const r = await api<{ excluidas: number }>('/cobrancas/limpar-pagas-importadas', { method: 'POST' });
      setMsg(`✓ ${r.excluidas} cobrança(s) paga(s) importada(s) removida(s). Elas podem voltar por cliente em "Sincronizar pagas".`);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao limpar'); }
    setBusy(false);
  }

  async function baixarModelo() {
    try {
      const r = await api<{ filename: string; base64: string; mime: string }>('/cobrancas/modelo-excel');
      const a = document.createElement('a');
      a.href = `data:${r.mime};base64,${r.base64}`;
      a.download = r.filename;
      a.click();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao baixar modelo'); }
  }


  async function excluirComEscopo(inv: Invoice, escopo: 'recorra' | 'ambos' | 'gateway') {
    try {
      const r = await api<{ mensagem?: string }>(`/cobrancas/${inv.id}?escopo=${escopo}`, { method: 'DELETE' });
      setMsg(r?.mensagem ? `✓ ${r.mensagem}` : '✓ Cobrança removida');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao excluir'); }
    setExcluir(null);
    load();
  }

  const filtrosAtivos = Object.entries(filtros).filter(([, v]) => v).length;
  const geradasSelecionadas = invoices.filter((i) => selecionados.has(i.id) && i.externalId).length;
  const valorSelecionado = invoices.filter((i) => selecionados.has(i.id)).reduce((s, i) => s + Number(i.valor), 0);

  // Ordenação clicável por Valor / Vencimento — feita no SERVIDOR (recarrega da 1ª página).
  function ordenarPor(campo: 'valor' | 'vencimento') {
    setOrdenacao((o) => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' }));
  }
  const seta = (campo: 'valor' | 'vencimento') =>
    ordenacao.campo === campo
      ? (ordenacao.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
      : <ArrowUpDown size={12} className="opacity-40" />;

  // "Ver mais" acumula páginas; a seleção/"marcar todas" opera só sobre o carregado.
  const temMais = invoices.length < total;
  const ORDEM_STATUS = ['VENCIDA', 'PENDENTE', 'PAGA', 'CANCELADA', 'ESTORNADA'];
  const statusResumo = resumo ? ORDEM_STATUS.filter((s) => resumo.porStatus[s]) : [];

  async function exportarCsv() {
    setMsg('Preparando exportação...');
    const r = await api<{ items: Invoice[]; truncado: boolean }>(`/cobrancas/exportar?${paramsFiltros().toString()}`).catch(() => null);
    if (!r) { setMsg('Erro ao exportar.'); return; }
    const headers = ['Cliente', 'Documento', 'Valor', 'Vencimento', 'Método', 'Status', 'Gerada no gateway'];
    const linhas = r.items.map((i) => [
      i.customer?.nome || '', i.customer?.doc || '', Number(i.valor).toFixed(2).replace('.', ','),
      new Date(i.vencimento).toLocaleDateString('pt-BR'), i.metodo, i.status, i.externalId ? 'Sim' : 'Não',
    ]);
    const hoje = new Date().toISOString().slice(0, 10);
    baixarArquivo(`cobrancas-${hoje}.csv`, toCsv(headers, linhas));
    setMsg(r.truncado ? '✓ Exportado (limitado a 20.000 linhas).' : `✓ ${r.items.length} cobrança(s) exportada(s).`);
  }

  const idsVisiveis = invoices.map((i) => i.id);
  const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.has(id));
  const toggleTodos = () => setSelecionados(todosMarcados ? new Set() : new Set(idsVisiveis));

  return (
    <div>
      <PageTitle title="Cobranças" subtitle="Faturas e geração de Pix/boleto nos gateways" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setCriar(true)} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Gerar cobrança manual</button>
        <div className="relative">
          <button onClick={() => setMenuImport((v) => !v)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importação <ChevronDown size={14} /></button>
          {menuImport && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuImport(false)} />
              <div className="absolute left-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
                <button onClick={() => { setMenuImport(false); setWizard(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><FileSpreadsheet size={15} /> Assistente Excel/CSV</button>
                <button onClick={() => { setMenuImport(false); gateways.length ? setConfirmarImport(true) : setMsg('Configure um gateway em Integrações primeiro.'); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><Download size={15} /> Importar do gateway</button>
                <button onClick={() => { setMenuImport(false); baixarModelo(); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><FileDown size={15} /> Baixar modelo Excel</button>
                <div className="border-t border-line" />
                <button onClick={() => { setMenuImport(false); setConfirmarLimparPagas(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-danger-tint"><Trash2 size={15} /> Limpar pagas importadas</button>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={reavaliarStatus} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><RefreshCw size={15} /> Reavaliar status</button>
          <span className="group relative inline-block">
            <button type="button" className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-primary"><HelpCircle size={15} /></button>
            <span className="pointer-events-none absolute left-0 top-7 z-30 hidden w-72 rounded-lg border border-line bg-surface p-3 text-xs text-ink shadow-lg group-hover:block">
              Marca como <strong>Vencida</strong> toda cobrança cujo vencimento já passou mas ainda aparece como <strong>Pendente</strong>. Isso normalmente acontece sozinho todo dia — use aqui se notar cobranças antigas ainda em Pendente e quiser corrigir na hora. Não altera cobranças pagas nem canceladas.
            </span>
          </span>
        </div>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>

      <div className="mb-4 rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Filter size={14} /> Filtros {filtrosAtivos > 0 && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-primary">{filtrosAtivos}</span>}
          {filtrosAtivos > 0 && <button onClick={() => setFiltros(emptyFiltros)} className="ml-auto text-primary hover:underline">Limpar</button>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <input placeholder="Cliente / CPF" value={filtros.q} onChange={(e) => setF('q', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary lg:col-span-2" />
          <select value={filtros.status} onChange={(e) => setF('status', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Status: todos</option><option value="PENDENTE">Pendente</option><option value="VENCIDA">Vencida</option><option value="PAGA">Paga</option><option value="CANCELADA">Cancelada</option>
          </select>
          <select value={filtros.metodo} onChange={(e) => setF('metodo', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Método: todos</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARTAO">Cartão</option>
          </select>
          <select value={filtros.geracao} onChange={(e) => setF('geracao', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Geração: todas</option><option value="gerada">Já gerada</option><option value="pendente">A gerar</option>
          </select>
          <select value={filtros.etiqueta} onChange={(e) => setF('etiqueta', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Etiqueta: todas</option>{etiquetas.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <input type="date" title="Vence de" value={filtros.de} onChange={(e) => setF('de', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="date" title="Vence até" value={filtros.ate} onChange={(e) => setF('ate', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input placeholder="Valor mín" value={filtros.valorMin} onChange={(e) => setF('valorMin', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input placeholder="Valor máx" value={filtros.valorMax} onChange={(e) => setF('valorMax', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
          <span>Total de cobranças: <span className="tabular font-medium text-ink">{total}</span>{temMais && <> · mostrando <span className="tabular font-medium text-ink">{invoices.length}</span></>}</span>
          {total > 0 && (
            <button onClick={exportarCsv} className="ml-auto flex items-center gap-1.5 rounded border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas" title="Baixar a base filtrada inteira em CSV (abre no Excel)">
              <FileDown size={14} /> Exportar ({total})
            </button>
          )}
        </div>
        {resumo && resumo.total > 0 && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted">
            <span>Valor total: <span className="tabular font-semibold text-ink">{brl(resumo.soma)}</span></span>
            {resumo.emAberto > 0 && <span>Em aberto: <span className="tabular font-semibold text-danger">{brl(resumo.emAberto)}</span></span>}
            <span>Ticket médio: <span className="tabular font-medium text-ink">{brl(resumo.ticketMedio)}</span></span>
            <span>Clientes: <span className="tabular font-medium text-ink">{resumo.clientesDistintos}</span></span>
            {resumo.critico.n > 0 && (
              <span title="Cobranças vencidas há mais de 30 dias — o valor mais difícil de recuperar">
                Atraso +30d: <span className="tabular font-semibold text-danger">{resumo.critico.n}</span> · <span className="tabular font-semibold text-danger">{brl(resumo.critico.valor)}</span>
              </span>
            )}
          </div>
        )}
        {statusResumo.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {statusResumo.map((s) => (
              <span key={s} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${statusColor[s] || 'bg-canvas text-muted'}`}>
                <span className="font-medium">{s}</span>
                <span className="tabular opacity-70">{resumo?.porStatus[s].n}</span>
                <span className="tabular font-semibold">{brl(resumo?.porStatus[s].valor ?? 0)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {selecionados.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-tint px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selecionados.size} cobrança(s) selecionada(s)</span>
          <button onClick={() => setConfirmarLote(true)} className="ml-auto flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Trash2 size={14} /> Excluir selecionadas</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs font-medium text-muted hover:text-ink">Limpar seleção</button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="w-10 px-4 py-3"><input type="checkbox" checked={todosMarcados} onChange={toggleTodos} className="h-4 w-4 cursor-pointer accent-primary" aria-label="Selecionar todas" /></th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium"><button onClick={() => ordenarPor('valor')} className="flex items-center gap-1 uppercase hover:text-ink" title="Ordenar por valor">Valor {seta('valor')}</button></th>
              <th className="px-4 py-3 font-medium"><button onClick={() => ordenarPor('vencimento')} className="flex items-center gap-1 uppercase hover:text-ink" title="Ordenar por vencimento">Vencimento {seta('vencimento')}</button></th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium"><span className="flex items-center gap-1">Status <AjudaStatus /></span></th>
              <th className="px-4 py-3 font-medium">Cobrança</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className={`border-b border-line last:border-0 ${selecionados.has(inv.id) ? 'bg-primary-tint/40' : ''}`}>
                <td className="px-4 py-3"><input type="checkbox" checked={selecionados.has(inv.id)} onChange={() => toggleSel(inv.id)} className="h-4 w-4 cursor-pointer accent-primary" aria-label={`Selecionar cobrança de ${inv.customer?.nome || 'cliente'}`} /></td>
                <td className="px-4 py-3 font-medium text-ink">{inv.customer?.nome || '—'}</td>
                <td className="tabular px-4 py-3">{brl(Number(inv.valor))}</td>
                <td className="px-4 py-3 text-muted">{new Date(inv.vencimento).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-muted">{inv.metodo}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[inv.status] || 'bg-canvas text-muted'}`}>{inv.status}</span>
                  {inv.gestaoCobranca === 'LEGADO' && <span className="ml-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted" title="Visível no histórico, fora das cobranças automáticas">LEGADO</span>}
                </td>
                <td className="px-4 py-3">
                  {inv.externalId ? <span className="text-xs text-success">✓ gerada</span>
                    : <span className="text-xs text-muted">não gerada</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {inv.externalId && <button onClick={() => setPagamento(inv)} title="Dados de pagamento (Pix/boleto)" className="rounded p-1.5 text-muted hover:bg-primary-tint hover:text-primary"><Receipt size={15} /></button>}
                    <button onClick={() => setEditar(inv)} title="Editar" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Pencil size={15} /></button>
                    <button onClick={() => setExcluir(inv)} title="Excluir" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhuma fatura.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {temMais && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={verMais} disabled={carregandoMais} className="rounded border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50">
            {carregandoMais ? 'Carregando…' : `Ver mais ${Math.min(POR_PAGINA, total - invoices.length)}`}
          </button>
          <span className="text-sm text-muted">{invoices.length} de {total}</span>
        </div>
      )}

      {editar && <EditarModal inv={editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
      {wizard && <ImportWizard criarCobrancas onClose={() => setWizard(false)} onDone={() => { setWizard(false); load(); }} />}
      {criar && <CriarManualModal gateways={gateways} onClose={() => setCriar(false)} onSaved={() => { setCriar(false); load(); }} />}
      {pagamento && <PagamentoModal inv={pagamento} onClose={() => setPagamento(null)} />}
      {excluir && <ExcluirModal inv={excluir} onClose={() => setExcluir(null)} onEscolha={(escopo) => excluirComEscopo(excluir, escopo)} />}
      {confirmarLote && (
        <ConfirmDialog
          titulo={`Excluir ${selecionados.size} cobrança(s)`}
          danger
          confirmLabel={`Excluir ${selecionados.size} do Recorrai`}
          mensagem={
            <>
              <p>Isto remove <b className="text-ink">{selecionados.size}</b> cobrança(s) daqui (total <b className="text-ink">{brl(valorSelecionado)}</b>). <b className="text-ink">Não dá para desfazer.</b></p>
              <p className="mt-2 rounded bg-canvas px-3 py-2 text-xs">
                {geradasSelecionadas > 0
                  ? <>🔒 Por segurança, as <b>{geradasSelecionadas}</b> já geradas <b>continuam ativas no gateway</b> — a exclusão em massa nunca cancela lá. Para cancelar no gateway, faça uma a uma pelo botão de excluir da linha.</>
                  : <>Nenhuma foi gerada no gateway, então só existem aqui no Recorrai.</>}
              </p>
            </>
          }
          onConfirm={excluirLote}
          onClose={() => setConfirmarLote(false)}
        />
      )}
      {confirmarImport && (
        <ImportarGatewayModal
          gateways={gateways}
          onClose={() => setConfirmarImport(false)}
          onDone={(texto) => { setConfirmarImport(false); setMsg(texto); load(); }}
        />
      )}
      {confirmarLimparPagas && (
        <ConfirmDialog
          titulo="Limpar cobranças pagas importadas"
          mensagem={<>Remover todas as cobranças <b className="text-ink">já pagas</b> que vieram da importação de gateway? Cobranças pendentes/vencidas e as geradas manualmente não são afetadas. Você pode trazer as pagas de volta por cliente em <b className="text-ink">Sincronizar pagas</b>.</>}
          confirmLabel="Limpar pagas"
          danger
          onConfirm={() => { setConfirmarLimparPagas(false); limparPagasImportadas(); }}
          onClose={() => setConfirmarLimparPagas(false)}
        />
      )}
    </div>
  );
}

interface ImportPreview {
  total: { quantidade: number; valor: number };
  ativas: { quantidade: number; valor: number };
  legado: { quantidade: number; valor: number };
}

function ImportarGatewayModal({ gateways, onClose, onDone }: { gateways: Gateway[]; onClose: () => void; onDone: (texto: string) => void }) {
  const inicial = gateways[0];
  const [accountId, setAccountId] = useState(inicial?.id ?? '');
  const [janela, setJanela] = useState(inicial?.importLookbackDays == null ? 'all' : String(inicial.importLookbackDays));
  const [previa, setPrevia] = useState<ImportPreview | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState('');
  const lookbackDays = janela === 'all' ? null : Number(janela);

  const calcularPrevia = useCallback(async () => {
    if (!accountId) return;
    setCarregando(true); setPrevia(null); setErro('');
    try {
      setPrevia(await api<ImportPreview>('/cobrancas/importar-gateway/previa', { method: 'POST', body: { accountId, lookbackDays } }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível calcular a prévia.');
    } finally {
      setCarregando(false);
    }
  }, [accountId, lookbackDays]);

  useEffect(() => { calcularPrevia(); }, [calcularPrevia]);

  async function importar() {
    if (!previa) return;
    setImportando(true); setErro('');
    try {
      const r = await api<{ clientes: number; clientesAtualizados: number; faturas: number; faturasAtualizadas: number; ativas: number; legado: number }>('/cobrancas/importar-gateway', { method: 'POST', body: { accountId, lookbackDays } });
      onDone(`✓ ${r.clientes} clientes novos, ${r.clientesAtualizados} atualizados · ${r.faturas} faturas novas, ${r.faturasAtualizadas} atualizadas · ${r.ativas} ativas e ${r.legado} em legado`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na importação');
      setImportando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !importando) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Importar do gateway</h2>
          <button onClick={onClose} disabled={importando} className="rounded p-1 text-muted hover:bg-canvas disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Gateway</span>
            <select value={accountId} onChange={(e) => {
              const id = e.target.value; setAccountId(id);
              const dias = gateways.find((g) => g.id === id)?.importLookbackDays;
              setJanela(dias == null ? 'all' : String(dias));
            }} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
              {gateways.map((g) => <option key={g.id} value={g.id}>{g.apelido || g.provider} · {g.ambiente}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="mb-1 flex items-center gap-1 text-xs text-muted">Cobranças vencidas que ficarão ativas <span className="group relative inline-flex"><HelpCircle size={13} /><span className="pointer-events-none absolute bottom-5 left-0 z-10 hidden w-64 rounded border border-line bg-surface p-2 text-xs font-normal text-ink shadow-lg group-hover:block">Legado continua no histórico e recebe baixa quando pago, mas não participa das mensagens automáticas.</span></span></span>
            <select value={janela} onChange={(e) => setJanela(e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
              <option value="0">Somente de hoje em diante</option><option value="30">Últimos 30 dias (recomendado)</option><option value="60">Últimos 60 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todas as cobranças abertas</option>
            </select>
          </label>
        </div>
        <div className="mt-4 min-h-24 rounded-lg border border-line bg-canvas p-3 text-sm">
          {carregando && <p className="flex items-center gap-2 text-muted"><RefreshCw size={14} className="animate-spin" /> Buscando cobranças no gateway...</p>}
          {previa && <div className="space-y-2"><p className="text-muted">Encontradas <b className="text-ink">{previa.total.quantidade}</b> cobranças abertas ({brl(previa.total.valor)}).</p><div className="grid grid-cols-2 gap-2"><div className="rounded bg-success-tint p-2"><b className="text-success">{previa.ativas.quantidade} ativas</b><br /><span className="text-xs text-muted">{brl(previa.ativas.valor)}</span></div><div className="rounded bg-surface p-2"><b className="text-ink">{previa.legado.quantidade} legado</b><br /><span className="text-xs text-muted">{brl(previa.legado.valor)}</span></div></div></div>}
          {erro && <p className="text-danger">{erro}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} disabled={importando} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas disabled:opacity-50">Cancelar</button><button onClick={importar} disabled={!previa || carregando || importando} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">{importando ? 'Importando...' : 'Confirmar importação'}</button></div>
      </div>
    </div>
  );
}

interface CustLite { id: string; nome: string; doc: string; valorPlano?: number }

function CriarManualModal({ gateways, onClose, onSaved }: { gateways: Gateway[]; onClose: () => void; onSaved: () => void }) {
  const [busca, setBusca] = useState('');
  const [opcoes, setOpcoes] = useState<CustLite[]>([]);
  const [cliente, setCliente] = useState<CustLite | null>(null);
  const hoje = new Date();
  const vencPadrao = new Date(hoje.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ valor: '', vencimento: vencPadrao, descricao: '', accountId: '', metodo: 'PIX' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const q = busca.trim();
    // Só busca quando o usuário digita algo (evita listar todos os clientes).
    if (q.length < 2) { setOpcoes([]); return; }
    const t = setTimeout(() => {
      api<CustLite[]>(`/clientes?q=${encodeURIComponent(q)}`).then((l) => setOpcoes(l.slice(0, 20))).catch(() => setOpcoes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  async function salvar() {
    if (!cliente) return setMsg('Selecione um cliente.');
    const valorNum = parseValorBR(f.valor);
    if (!valorNum || valorNum <= 0) return setMsg('Informe um valor válido (ex.: 109,90).');
    setSaving(true); setMsg('');
    try {
      await api('/cobrancas/fatura', { method: 'POST', body: {
        customerId: cliente.id, valor: valorNum, vencimento: f.vencimento,
        descricao: f.descricao || undefined, accountId: f.accountId || undefined, metodo: f.metodo,
      } });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Criar cobrança manual</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        {cliente ? (
          <div className="mb-3 flex items-center justify-between rounded border border-line bg-canvas px-3 py-2 text-sm">
            <span><b className="text-ink">{cliente.nome}</b> <span className="text-muted">· {cliente.doc}</span></span>
            <button onClick={() => setCliente(null)} className="text-xs text-primary hover:underline">trocar</button>
          </div>
        ) : (
          <div className="mb-3">
            <input autoFocus placeholder="Buscar cliente por nome ou CPF/CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            {opcoes.length > 0 && (
              <div className="mt-1 max-h-40 overflow-auto rounded border border-line">
                {opcoes.map((o) => (
                  <button key={o.id} onClick={() => { setCliente(o); if (o.valorPlano) set('valor', String(o.valorPlano)); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-canvas">
                    <b className="text-ink">{o.nome}</b> <span className="text-muted">· {o.doc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor (R$) *</span><input value={f.valor} onChange={(e) => set('valor', e.target.value)} placeholder="109,90" inputMode="decimal" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Vencimento *</span><input type="date" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Descrição</span><input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Mensalidade" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Gateway</span>
              <select value={f.accountId} onChange={(e) => set('accountId', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
                <option value="">Só registrar (sem Pix)</option>
                {gateways.map((g) => <option key={g.id} value={g.id}>{g.apelido || g.provider}{g.ambiente ? ` · ${g.ambiente}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Método</span>
              <select value={f.metodo} onChange={(e) => set('metodo', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
                <option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARTAO">Cartão</option>
              </select>
            </label>
          </div>
        </div>
        {msg && <p className="mt-3 text-sm text-danger">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'Criando...' : 'Criar'}</button>
        </div>
      </div>
    </div>
  );
}

function ExcluirModal({ inv, onClose, onEscolha }: { inv: Invoice; onClose: () => void; onEscolha: (escopo: 'recorra' | 'ambos') => void }) {
  const gerada = !!inv.externalId;
  // 'menu' escolhe a ação; 'gateway' pede a confirmação digitada do cancelamento irreversível.
  const [modo, setModo] = useState<'menu' | 'gateway'>('menu');
  const [digitado, setDigitado] = useState('');
  const podeCancelar = digitado.trim().toUpperCase() === 'CANCELAR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Excluir cobrança</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">{inv.customer?.nome || '—'} · {brl(Number(inv.valor))} · venc. {new Date(inv.vencimento).toLocaleDateString('pt-BR')}</p>

        {modo === 'menu' && (
          <>
            {!gerada && <p className="mb-3 rounded bg-canvas px-3 py-2 text-xs text-muted">Esta cobrança ainda não foi gerada no gateway, então só existe no Recorrai.</p>}
            <div className="space-y-2">
              <button onClick={() => onEscolha('recorra')} className="w-full rounded border border-line p-3 text-left hover:border-primary hover:bg-canvas">
                <div className="text-sm font-medium text-ink">Excluir só no Recorrai</div>
                <div className="text-xs text-muted">Remove o registro daqui. {gerada ? 'A cobrança continua ativa no gateway (dá para reimportar depois).' : ''}</div>
              </button>
              {gerada && (
                <button onClick={() => setModo('gateway')} className="w-full rounded border border-line p-3 text-left hover:border-danger hover:bg-danger-tint">
                  <div className="text-sm font-medium text-danger">Cancelar também no gateway ⚠️</div>
                  <div className="text-xs text-muted">Cancela a cobrança no gateway (Asaas/MercadoPago/etc.) e apaga daqui. <b>Irreversível</b> — afeta o cliente real.</div>
                </button>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
            </div>
          </>
        )}

        {modo === 'gateway' && (
          <>
            <div className="mb-4 rounded border border-danger/40 bg-danger-tint px-3 py-2 text-xs text-ink">
              ⚠️ <b>Ação irreversível.</b> Isto vai <b>cancelar a cobrança no gateway</b> — o cliente não conseguirá mais pagar por ela e não há como reverter. Só faça se tem certeza.
            </div>
            <label className="mb-1 block text-xs text-muted">Para confirmar, digite <b className="font-mono text-danger">CANCELAR</b></label>
            <input
              autoFocus
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && podeCancelar) onEscolha('ambos'); }}
              placeholder="CANCELAR"
              className="mb-5 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-danger"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModo('menu'); setDigitado(''); }} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Voltar</button>
              <button
                onClick={() => onEscolha('ambos')}
                disabled={!podeCancelar}
                className="rounded bg-danger px-5 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancelar no gateway
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Copyable({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  function copiar() {
    navigator.clipboard?.writeText(valor).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); });
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button onClick={copiar} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary-tint">{ok ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}</button>
      </div>
      <div className={`max-h-24 overflow-auto rounded border border-line bg-canvas p-2 text-xs text-ink ${mono ? "break-all font-mono" : ""}`}>{valor}</div>
    </div>
  );
}

function PagamentoModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const nada = !inv.pixCopiaCola && !inv.boletoLinha && !inv.boletoUrl && !inv.linkPagamento;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Dados de pagamento</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">{inv.customer?.nome || "—"} · {brl(Number(inv.valor))} · venc. {new Date(inv.vencimento).toLocaleDateString("pt-BR")}</p>

        {nada ? (
          <p className="rounded bg-canvas px-3 py-3 text-sm text-muted">Esta cobrança ainda não tem Pix/boleto gerado. Gere a cobrança em um gateway para coletar os dados de pagamento.</p>
        ) : (
          <div className="space-y-4">
            {inv.pixCopiaCola && <Copyable label="Pix copia e cola" valor={inv.pixCopiaCola} mono />}
            {inv.boletoLinha && <Copyable label="Linha digitável do boleto" valor={inv.boletoLinha} mono />}
            {inv.linkPagamento && <Copyable label="Link de pagamento" valor={inv.linkPagamento} />}
            <div className="flex flex-wrap gap-2 pt-1">
              {inv.linkPagamento && <a href={inv.linkPagamento} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded border border-line px-3 py-2 text-sm hover:bg-canvas"><ExternalLink size={14} /> Abrir página de pagamento</a>}
              {inv.boletoUrl && <a href={inv.boletoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded border border-line px-3 py-2 text-sm hover:bg-canvas"><Download size={14} /> Baixar/abrir boleto</a>}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Fechar</button>
        </div>
      </div>
    </div>
  );
}

function EditarModal({ inv, onClose, onSaved }: { inv: Invoice; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    valor: String(inv.valor), vencimento: inv.vencimento.slice(0, 10), descricao: inv.descricao || '', status: inv.status,
  });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function salvar() {
    setSaving(true); setMsg('');
    try {
      await api(`/cobrancas/${inv.id}`, { method: 'PUT', body: { valor: parseValorBR(f.valor), vencimento: f.vencimento, descricao: f.descricao, status: f.status } });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Editar cobrança</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-3 text-xs text-muted">Cliente: <b className="text-ink">{inv.customer?.nome || '—'}</b></p>
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor (R$)</span><input value={f.valor} onChange={(e) => set('valor', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Vencimento</span><input type="date" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Descrição</span><input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Status</span>
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
              <option value="PENDENTE">Pendente</option><option value="VENCIDA">Vencida</option><option value="PAGA">Paga</option><option value="CANCELADA">Cancelada</option><option value="ESTORNADA">Estornada</option>
            </select>
          </label>
        </div>
        {inv.externalId && <p className="mt-3 text-xs text-warning">Esta cobrança já foi emitida no gateway. Alterar valor/vencimento aqui não altera a cobrança no gateway — só o registro no Recorrai.</p>}
        {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
