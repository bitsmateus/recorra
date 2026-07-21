'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { UserPlus, Download, RefreshCw, Eye, Pencil, Trash2, X, Tag, Plus, Check, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, RiskBadge } from '@/components/ui';
import { ImportWizard } from '@/components/ImportWizard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Customer {
  id: string;
  nome: string;
  doc: string;
  telefone?: string;
  email?: string;
  plano?: string;
  valorPlano?: number;
  cidade?: string;
  uf?: string;
  tags?: string[];
  cobrancasTotal?: number;
  cobrancasPagas?: number;
}
interface RiskScore { faixa: string; score: number }
interface Gateway { id: string; provider: string; ambiente?: string; apelido?: string }

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

type Etiqueta = { nome: string; cor?: string | null };
type Aba = 'geral' | 'aberto' | 'incompleto';

const CORES_ETIQUETA = ['#14857C', '#7C3AED', '#F0A93B', '#EF4444', '#22A45D', '#3B82F6', '#EC4899', '#64748B'];

// Situação derivada das cobranças do cliente (total x pagas).
function situacaoDe(c: Customer): { key: string; label: string; bg: string; fg: string } {
  const total = c.cobrancasTotal ?? 0;
  const pagas = c.cobrancasPagas ?? 0;
  if (total === 0) return { key: 'novo', label: 'Novo', bg: '#EDE9FE', fg: '#6D28D9' };
  if (pagas < total) return { key: 'aberto', label: 'Em aberto', bg: '#FCEBEB', fg: '#A32D2D' };
  return { key: 'dia', label: 'Em dia', bg: '#E4F4EA', fg: '#0F6E56' };
}


function SituacaoBadge({ c }: { c: Customer }) {
  const s = situacaoDe(c);
  return <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

function TagChip({ nome, cor }: { nome: string; cor?: string | null }) {
  const bg = cor || '#E1F0EE';
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: bg, color: cor ? '#fff' : '#14857C' }}>{nome}</span>;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Customer[]>([]);
  const [riscos, setRiscos] = useState<Record<string, RiskScore | null>>({});
  const [loading, setLoading] = useState(true);
  // `filtros` = o que está nos campos; `aplicados` = o que de fato filtra a lista.
  // A busca só roda ao clicar em Filtrar (ou Enter), evitando refetch a cada tecla.
  const FILTROS_VAZIOS = { q: '', uf: '', plano: '', etiqueta: '', valorMin: '', faixa: '' };
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VAZIOS);
  const [modal, setModal] = useState<{ open: boolean; edit?: Customer | null }>({ open: false });
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [importModal, setImportModal] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [aba, setAba] = useState<Aba>('geral');
  const [etiquetasModal, setEtiquetasModal] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<Customer | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const POR_PAGINA = 50;
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [contagens, setContagens] = useState({ geral: 0, aberto: 0, incompleto: 0 });

  const toggleSel = (id: string) => setSelecionados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const reloadEtiquetas = useCallback(() => { api<Etiqueta[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => {}); }, []);

  async function fetchRiscos(rows: Customer[]) {
    const pares = await Promise.all(rows.map(async (c) => [c.id, await api<RiskScore | null>(`/clientes/${c.id}/risco`).catch(() => null)] as const));
    setRiscos((prev) => { const m = { ...prev }; for (const [id, r] of pares) m[id] = r; return m; });
  }
  const paramsClientes = (pg: number) => {
    const params = new URLSearchParams();
    Object.entries(aplicados).forEach(([k, v]) => v && params.set(k, v));
    params.set('aba', aba); params.set('page', String(pg)); params.set('pageSize', String(POR_PAGINA));
    return params;
  };

  // Paginação de SERVIDOR: cada carga é uma página; abas e contagens vêm do banco.
  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await api<{ items: Customer[]; total: number; contagens: { geral: number; aberto: number; incompleto: number } }>(`/clientes?${paramsClientes(1).toString()}`).catch(() => null);
    setLoading(false);
    if (!r) return;
    setClientes(r.items); setTotal(r.total); setContagens(r.contagens); setPagina(1);
    fetchRiscos(r.items);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicados, aba]);

  async function verMais() {
    const prox = pagina + 1;
    const r = await api<{ items: Customer[]; total: number }>(`/clientes?${paramsClientes(prox).toString()}`).catch(() => null);
    if (!r) return;
    setClientes((prev) => [...prev, ...r.items]); setTotal(r.total); setPagina(prox);
    fetchRiscos(r.items);
  }

  useEffect(() => { carregar(); }, [carregar]);

  // Busca automática ~450ms após parar de digitar/mexer nos filtros (além do botão Filtrar).
  useEffect(() => {
    const t = setTimeout(() => setAplicados(filtros), 450);
    return () => clearTimeout(t);
  }, [filtros]);

  const aplicarFiltros = () => setAplicados(filtros);
  const limparFiltros = () => { setFiltros(FILTROS_VAZIOS); setAplicados(FILTROS_VAZIOS); };
  const filtrosPendentes = JSON.stringify(filtros) !== JSON.stringify(aplicados);
  const temFiltroAtivo = Object.values(aplicados).some(Boolean);
  // Some da seleção quem foi excluído ou saiu da lista no recarregamento.
  useEffect(() => { setSelecionados((s) => new Set([...s].filter((id) => clientes.some((c) => c.id === id)))); }, [clientes]);
  useEffect(() => {
    api<Gateway[]>('/config/gateways').then(setGateways).catch(() => setGateways([]));
    api<Etiqueta[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([]));
  }, []);

  async function excluir(c: Customer) {
    await api(`/clientes/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  async function excluirLote() {
    await api('/clientes/excluir-lote', { method: 'POST', body: { ids: [...selecionados] } }).catch(() => {});
    setSelecionados(new Set());
    carregar();
  }

  function recarregarTudo() {
    carregar();
    api<Etiqueta[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => {});
  }

  const corPorTag = new Map(etiquetas.map((e) => [e.nome, e.cor] as const));
  // O servidor já devolve a aba filtrada e paginada; a lista carregada É o que se vê.
  const temMais = clientes.length < total;
  const contagem = contagens;
  // "Selecionar todos" marca apenas o que está carregado (evita marcar milhares sem querer).
  const idsVisiveis = clientes.map((c) => c.id);
  const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.has(id));
  const toggleTodos = () => setSelecionados(todosMarcados ? new Set() : new Set(idsVisiveis));

  return (
    <div>
      <PageTitle title="Clientes" subtitle="Base de clientes, segmentação e faixa de risco (IA)" />

      {/* Abas */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {([['geral', 'Visão geral'], ['aberto', 'Em aberto'], ['incompleto', 'Cadastro incompleto']] as [Aba, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setAba(k); setSelecionados(new Set()); }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${aba === k ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label} <span className="tabular text-xs text-muted">({contagem[k]})</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setModal({ open: true, edit: null })} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><UserPlus size={16} /> Novo cliente</button>
        <button onClick={() => setEtiquetasModal(true)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Tag size={16} /> Etiquetas</button>
        <button onClick={() => setWizard(true)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importar (Excel/CSV)</button>
        {gateways.length > 0 && <button onClick={() => setImportModal(true)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importar de gateway</button>}
        <button onClick={async () => { await api('/clientes/risco/recalcular-todos', { method: 'POST' }).catch(() => {}); carregar(); }} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><RefreshCw size={16} /> Recalcular risco</button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <input placeholder="Buscar (nome ou CPF/CNPJ)" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') aplicarFiltros(); }} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <input placeholder="Plano" value={filtros.plano} onChange={(e) => setFiltros({ ...filtros, plano: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') aplicarFiltros(); }} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <select value={filtros.uf} onChange={(e) => setFiltros({ ...filtros, uf: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">{UFS.map((u) => <option key={u} value={u}>{u || 'UF'}</option>)}</select>
        <select value={filtros.etiqueta} onChange={(e) => setFiltros({ ...filtros, etiqueta: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Etiqueta: todas</option>{etiquetas.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}</select>
        <input placeholder="Valor mín" value={filtros.valorMin} onChange={(e) => setFiltros({ ...filtros, valorMin: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') aplicarFiltros(); }} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <select value={filtros.faixa} onChange={(e) => setFiltros({ ...filtros, faixa: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Risco: todos</option><option value="BOM">Bom pagador</option><option value="ATENCAO">Atenção</option><option value="RISCO">Risco</option></select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={aplicarFiltros} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Search size={16} /> Filtrar</button>
        <button onClick={carregar} title="Recarregar a lista" className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><RefreshCw size={16} /> Atualizar</button>
        {(temFiltroAtivo || filtrosPendentes) && <button onClick={limparFiltros} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Limpar filtros</button>}
        {filtrosPendentes && <span className="text-xs text-muted">Buscando…</span>}
      </div>

      <div className="mb-2 flex items-center gap-3 text-sm text-muted">
        <span>Total de clientes: <span className="tabular font-medium text-ink">{total}</span>{temMais && <> · mostrando <span className="tabular font-medium text-ink">{clientes.length}</span></>}</span>
      </div>

      {selecionados.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-tint px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selecionados.size} cliente(s) selecionado(s)</span>
          <button onClick={() => setConfirmarLote(true)} className="ml-auto flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Trash2 size={14} /> Excluir selecionados</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs font-medium text-muted hover:text-ink">Limpar seleção</button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr><th className="w-10 px-4 py-3"><input type="checkbox" checked={todosMarcados} onChange={toggleTodos} className="h-4 w-4 cursor-pointer accent-primary" aria-label="Selecionar todos" /></th><th className="px-4 py-3 font-medium">Cliente</th><th className="px-4 py-3 font-medium">Documento</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3 font-medium">Tags</th><th className="px-4 py-3 font-medium">Cobranças</th><th className="px-4 py-3 font-medium">Score / Risco</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className={`border-b border-line last:border-0 hover:bg-canvas/50 ${selecionados.has(c.id) ? 'bg-primary-tint/40' : ''}`}>
                <td className="px-4 py-3"><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => toggleSel(c.id)} className="h-4 w-4 cursor-pointer accent-primary" aria-label={`Selecionar ${c.nome}`} /></td>
                <td className="px-4 py-3">
                  <Link href={`/clientes/${c.id}`} className="font-medium text-ink hover:text-primary">{c.nome}</Link>
                  <div className="text-xs text-muted">{c.plano || 'Sem plano'}{c.uf ? ` · ${c.uf}` : ''}</div>
                </td>
                <td className="tabular px-4 py-3 text-muted">{c.doc}</td>
                <td className="px-4 py-3"><SituacaoBadge c={c} /></td>
                <td className="px-4 py-3">
                  {c.tags && c.tags.length > 0 ? (
                    <div className="flex max-w-[180px] flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => <TagChip key={t} nome={t} cor={corPorTag.get(t)} />)}
                      {c.tags.length > 3 && <span className="text-[10px] text-muted">+{c.tags.length - 3}</span>}
                    </div>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="tabular font-medium text-success">{c.cobrancasPagas ?? 0}</span>
                  <span className="text-muted">/{c.cobrancasTotal ?? 0} pagas</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {riscos[c.id]?.score != null && <span className="tabular text-sm font-semibold text-ink">{riscos[c.id]!.score}</span>}
                    <RiskBadge faixa={riscos[c.id]?.faixa} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/clientes/${c.id}`} title="Ver detalhes" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Eye size={16} /></Link>
                    <button onClick={() => setModal({ open: true, edit: c })} title="Editar" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Pencil size={16} /></button>
                    <button onClick={() => setConfirmarExclusao(c)} title="Excluir" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && clientes.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhum cliente encontrado.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {temMais && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={verMais} className="rounded border border-line px-4 py-2 text-sm font-medium hover:bg-canvas">
            Ver mais {Math.min(POR_PAGINA, total - clientes.length)}
          </button>
          <span className="text-sm text-muted">{clientes.length} de {total}</span>
        </div>
      )}
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {modal.open && <CustomerModal edit={modal.edit} etiquetas={etiquetas} onEtiquetasChange={reloadEtiquetas} onClose={() => setModal({ open: false })} onSaved={() => { setModal({ open: false }); recarregarTudo(); }} />}
      {etiquetasModal && <EtiquetasModal etiquetas={etiquetas} onChange={reloadEtiquetas} onClose={() => setEtiquetasModal(false)} />}
      {importModal && <ImportGatewayModal gateways={gateways} onClose={() => setImportModal(false)} onDone={() => { setImportModal(false); recarregarTudo(); }} />}
      {wizard && <ImportWizard criarCobrancas={false} onClose={() => setWizard(false)} onDone={() => { setWizard(false); recarregarTudo(); }} />}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir cliente"
          mensagem={<>Excluir o cliente <b className="text-ink">{confirmarExclusao.nome}</b>? Isso remove as faturas e o histórico dele. <b className="text-ink">Não dá para desfazer.</b></>}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { const c = confirmarExclusao; setConfirmarExclusao(null); excluir(c); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
      {confirmarLote && (
        <ConfirmDialog
          titulo="Excluir clientes"
          mensagem={<>Excluir <b className="text-ink">{selecionados.size}</b> cliente(s) selecionado(s)? Isso remove as faturas e o histórico de cada um. Não dá para desfazer.</>}
          confirmLabel={`Excluir ${selecionados.size}`}
          danger
          onConfirm={() => { setConfirmarLote(false); excluirLote(); }}
          onClose={() => setConfirmarLote(false)}
        />
      )}
    </div>
  );
}

function ImportGatewayModal({ gateways, onClose, onDone }: { gateways: Gateway[]; onClose: () => void; onDone: () => void }) {
  const [accountId, setAccountId] = useState(gateways[0]?.id || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function importar() {
    if (!accountId) return setMsg('Selecione um gateway.');
    setBusy(true); setMsg('Importando... pode levar alguns segundos.');
    try {
      const r = await api<{ clientes: number; clientesAtualizados: number; faturas: number; faturasAtualizadas: number }>('/cobrancas/importar-gateway', { method: 'POST', body: { accountId } });
      setMsg(`✓ ${r.clientes} clientes novos, ${r.clientesAtualizados} atualizados · ${r.faturas} faturas importadas`);
      setTimeout(onDone, 1200);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro na importação'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Importar de gateway</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-muted">Puxa clientes e cobranças existentes do gateway escolhido para o Recorrai (deduplica por CPF/CNPJ).</p>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Gateway de origem</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
            {gateways.map((g) => <option key={g.id} value={g.id}>{g.apelido || g.provider}{g.ambiente ? ` · ${g.ambiente}` : ''}</option>)}
          </select>
        </label>
        {msg && <p className="mt-3 text-sm text-primary">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Fechar</button>
          <button onClick={importar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Importando...' : 'Importar'}</button>
        </div>
      </div>
    </div>
  );
}

function CustomerModal({ edit, etiquetas, onEtiquetasChange, onClose, onSaved }: { edit?: Customer | null; etiquetas: Etiqueta[]; onEtiquetasChange: () => void; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome: edit?.nome || '', doc: edit?.doc || '', email: edit?.email || '', telefone: edit?.telefone || '',
    plano: edit?.plano || '', valorPlano: edit?.valorPlano ? String(edit.valorPlano) : '', cidade: edit?.cidade || '', uf: edit?.uf || '',
  });
  const [selTags, setSelTags] = useState<string[]>(edit?.tags || []);
  const [novaTag, setNovaTag] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const corDe = (nome: string) => etiquetas.find((e) => e.nome === nome)?.cor || null;
  const toggleTag = (nome: string) => setSelTags((s) => (s.includes(nome) ? s.filter((t) => t !== nome) : [...s, nome]));

  async function criarEAssociar() {
    const n = novaTag.trim().toLowerCase();
    if (!n) return;
    try {
      await api('/clientes/etiquetas', { method: 'POST', body: { nome: n, cor: CORES_ETIQUETA[etiquetas.length % CORES_ETIQUETA.length] } });
      onEtiquetasChange();
      setSelTags((s) => (s.includes(n) ? s : [...s, n]));
      setNovaTag('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao criar etiqueta'); }
  }

  async function salvar() {
    setSaving(true); setMsg('');
    const body = { ...f, valorPlano: f.valorPlano ? Number(f.valorPlano.replace(',', '.')) : undefined, tags: selTags };
    try {
      if (edit) await api(`/clientes/${edit.id}`, { method: 'PUT', body });
      else await api('/clientes', { method: 'POST', body });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{edit ? 'Editar cliente' : 'Novo cliente'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Nome *</span><input value={f.nome} onChange={(e) => set('nome', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">CPF/CNPJ *</span><input value={f.doc} onChange={(e) => set('doc', e.target.value)} disabled={!!edit} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary disabled:bg-canvas" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">E-mail</span><input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@email.com" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Telefone</span><input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Plano</span><input value={f.plano} onChange={(e) => set('plano', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Valor do plano</span><input value={f.valorPlano} onChange={(e) => set('valorPlano', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Cidade</span><input value={f.cidade} onChange={(e) => set('cidade', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">UF</span><input value={f.uf} maxLength={2} onChange={(e) => set('uf', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <div className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">Etiquetas</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {etiquetas.map((e) => {
                const sel = selTags.includes(e.nome);
                return (
                  <button
                    key={e.nome}
                    type="button"
                    onClick={() => toggleTag(e.nome)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${sel ? 'text-white' : 'border border-line text-muted hover:bg-canvas'}`}
                    style={sel ? { background: e.cor || '#14857C' } : undefined}
                  >
                    {sel && <Check size={12} />}{e.nome}
                  </button>
                );
              })}
              {etiquetas.length === 0 && <span className="text-xs text-muted">Nenhuma etiqueta ainda — crie uma abaixo.</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criarEAssociar(); } }} placeholder="Nova etiqueta..." className="flex-1 rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-primary" />
              <button type="button" onClick={criarEAssociar} disabled={!novaTag.trim()} className="flex items-center gap-1 rounded border border-line px-3 py-1.5 text-sm text-primary hover:bg-canvas disabled:opacity-50"><Plus size={14} /> Criar</button>
            </div>
          </div>
        </div>
        {msg && <p className="mt-3 text-sm text-danger">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

function EtiquetasModal({ etiquetas, onChange, onClose }: { etiquetas: Etiqueta[]; onChange: () => void; onClose: () => void }) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_ETIQUETA[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);

  async function criar() {
    const n = nome.trim().toLowerCase();
    if (!n) return;
    setBusy(true); setMsg('');
    try {
      await api('/clientes/etiquetas', { method: 'POST', body: { nome: n, cor } });
      setNome(''); onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }
  async function excluir(nomeTag: string) {
    await api(`/clientes/etiquetas/${encodeURIComponent(nomeTag)}`, { method: 'DELETE' }).catch(() => {});
    onChange();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Etiquetas</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <div className="mb-4 rounded-lg border border-line p-3">
          <span className="mb-2 block text-xs text-muted">Nova etiqueta</span>
          <div className="flex gap-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar(); } }} placeholder="Ex.: vip, atraso frequente..." className="flex-1 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <button onClick={criar} disabled={busy || !nome.trim()} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? '...' : 'Criar'}</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Cor:</span>
            {CORES_ETIQUETA.map((c) => (
              <button key={c} type="button" onClick={() => setCor(c)} className={`h-6 w-6 rounded-full ${cor === c ? 'ring-2 ring-offset-1' : ''}`} style={{ background: c, boxShadow: cor === c ? `0 0 0 2px ${c}` : undefined }} aria-label={`Cor ${c}`} />
            ))}
          </div>
          {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
        </div>

        <div className="space-y-1.5">
          {etiquetas.map((e) => (
            <div key={e.nome} className="flex items-center justify-between rounded border border-line px-3 py-2">
              <TagChip nome={e.nome} cor={e.cor} />
              <button onClick={() => setConfirmarExclusao(e.nome)} className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
            </div>
          ))}
          {etiquetas.length === 0 && <p className="py-4 text-center text-sm text-muted">Nenhuma etiqueta criada ainda.</p>}
        </div>
      </div>
      {/* z-[60] do ConfirmDialog fica acima deste modal (z-50). */}
      {confirmarExclusao !== null && (
        <ConfirmDialog
          titulo="Excluir etiqueta"
          mensagem={<>Excluir a etiqueta <b className="text-ink">{confirmarExclusao}</b>? Os clientes já marcados continuam com ela.</>}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { const n = confirmarExclusao; setConfirmarExclusao(null); excluir(n); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </div>
  );
}
