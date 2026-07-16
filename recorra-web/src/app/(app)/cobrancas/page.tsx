'use client';

import { useEffect, useState, useCallback } from 'react';
import { Zap, Layers, Download, Pencil, Trash2, X, Filter, Plus, FileSpreadsheet, FileDown, ChevronDown, Receipt, Copy, ExternalLink, Check } from 'lucide-react';
import { ImportWizard } from '@/components/ImportWizard';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';

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
interface Gateway { id: string; provider: string; ambiente: string; apelido?: string }

const statusColor: Record<string, string> = {
  PENDENTE: 'bg-warning-tint text-[#854F0B]',
  VENCIDA: 'bg-danger-tint text-[#A32D2D]',
  PAGA: 'bg-success-tint text-[#0F6E56]',
  CANCELADA: 'bg-canvas text-muted',
  ESTORNADA: 'bg-canvas text-muted',
};

const emptyFiltros = { q: '', status: '', metodo: '', geracao: '', de: '', ate: '', valorMin: '', valorMax: '', etiqueta: '' };

export default function CobrancasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [accountId, setAccountId] = useState('');
  const [metodoGerar, setMetodoGerar] = useState('PIX');
  const [filtros, setFiltros] = useState(emptyFiltros);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editar, setEditar] = useState<Invoice | null>(null);
  const [excluir, setExcluir] = useState<Invoice | null>(null);
  const [pagamento, setPagamento] = useState<Invoice | null>(null);
  const [criar, setCriar] = useState(false);
  const [menuImport, setMenuImport] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [etiquetas, setEtiquetas] = useState<{ nome: string }[]>([]);
  const setF = (k: string, v: string) => setFiltros((s) => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v));
    const inv = await api<Invoice[]>(`/cobrancas?${params.toString()}`).catch(() => []);
    setInvoices(inv);
  }, [filtros]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<Gateway[]>('/config/gateways').then((gws) => { setGateways(gws); setAccountId((cur) => cur || (gws[0]?.id ?? '')); }).catch(() => setGateways([]));
    api<{ nome: string }[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([]));
  }, []);

  async function gerar(id: string) {
    if (!accountId) return setMsg('Configure um gateway primeiro (Integrações).');
    setMsg('Gerando...');
    await api(`/cobrancas/${id}/gerar`, { method: 'POST', body: { accountId, metodo: metodoGerar } }).catch((e) => setMsg(e.message));
    setMsg('✓ Cobrança gerada');
    load();
  }

  async function gerarLote() {
    if (!accountId) return setMsg('Configure um gateway primeiro.');
    setBusy(true); setMsg('Gerando em lote...');
    const r = await api<{ geradas: number; total: number }>('/cobrancas/lote', { method: 'POST', body: { accountId, metodo: metodoGerar } }).catch(() => ({ geradas: 0, total: 0 }));
    setMsg(`✓ ${r.geradas}/${r.total} cobranças geradas`);
    setBusy(false); load();
  }

  async function importarGateway() {
    if (!accountId) return setMsg('Selecione um gateway primeiro.');
    const g = gateways.find((x) => x.id === accountId);
    if (!confirm(`Importar clientes e cobranças de ${g?.apelido || g?.provider || 'gateway'} para o Recorrai?`)) return;
    setBusy(true); setMsg('Importando do gateway...');
    try {
      const r = await api<{ clientes: number; clientesAtualizados: number; faturas: number; faturasAtualizadas: number }>('/cobrancas/importar-gateway', { method: 'POST', body: { accountId } });
      setMsg(`✓ ${r.clientes} clientes novos, ${r.clientesAtualizados} atualizados · ${r.faturas} faturas novas, ${r.faturasAtualizadas} atualizadas`);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro na importação'); }
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

  return (
    <div>
      <PageTitle title="Cobranças" subtitle="Faturas e geração de Pix/boleto nos gateways" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          {gateways.length === 0 && <option value="">Nenhum gateway</option>}
          {gateways.map((g) => <option key={g.id} value={g.id}>{g.apelido || g.provider} ({g.ambiente})</option>)}
        </select>
        <select value={metodoGerar} onChange={(e) => setMetodoGerar(e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="PIX">Pix</option>
          <option value="BOLETO">Boleto</option>
          <option value="CARTAO">Cartão</option>
        </select>
        <button onClick={gerarLote} disabled={busy} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><Layers size={16} /> Gerar em lote</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setCriar(true)} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Gerar cobrança manual</button>
        <div className="relative">
          <button onClick={() => setMenuImport((v) => !v)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importação <ChevronDown size={14} /></button>
          {menuImport && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuImport(false)} />
              <div className="absolute left-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
                <button onClick={() => { setMenuImport(false); setWizard(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><FileSpreadsheet size={15} /> Assistente Excel/CSV</button>
                <button onClick={() => { setMenuImport(false); importarGateway(); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><Download size={15} /> Importar do gateway</button>
                <button onClick={() => { setMenuImport(false); baixarModelo(); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-canvas"><FileDown size={15} /> Baixar modelo Excel</button>
              </div>
            </>
          )}
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

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Cobrança</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{inv.customer?.nome || '—'}</td>
                <td className="tabular px-4 py-3">{brl(Number(inv.valor))}</td>
                <td className="px-4 py-3 text-muted">{new Date(inv.vencimento).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-muted">{inv.metodo}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[inv.status] || 'bg-canvas text-muted'}`}>{inv.status}</span></td>
                <td className="px-4 py-3">
                  {inv.externalId ? <span className="text-xs text-success">✓ gerada</span>
                    : inv.status === 'PAGA' || inv.status === 'CANCELADA' ? <span className="text-xs text-muted">—</span>
                    : <button onClick={() => gerar(inv.id)} className="flex items-center gap-1 rounded border border-line px-3 py-1 text-xs hover:bg-canvas"><Zap size={13} /> Gerar</button>}
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
            {invoices.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhuma fatura.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {editar && <EditarModal inv={editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
      {wizard && <ImportWizard criarCobrancas onClose={() => setWizard(false)} onDone={() => { setWizard(false); load(); }} />}
      {criar && <CriarManualModal gateways={gateways} onClose={() => setCriar(false)} onSaved={() => { setCriar(false); load(); }} />}
      {pagamento && <PagamentoModal inv={pagamento} onClose={() => setPagamento(null)} />}
      {excluir && <ExcluirModal inv={excluir} onClose={() => setExcluir(null)} onEscolha={(escopo) => excluirComEscopo(excluir, escopo)} />}
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

function ExcluirModal({ inv, onClose, onEscolha }: { inv: Invoice; onClose: () => void; onEscolha: (escopo: 'recorra' | 'ambos' | 'gateway') => void }) {
  const gerada = !!inv.externalId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Excluir cobrança</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">{inv.customer?.nome || '—'} · {brl(Number(inv.valor))} · venc. {new Date(inv.vencimento).toLocaleDateString('pt-BR')}</p>
        {!gerada && <p className="mb-3 rounded bg-canvas px-3 py-2 text-xs text-muted">Esta cobrança ainda não foi gerada no gateway, então só existe no Recorrai.</p>}
        <div className="space-y-2">
          <button onClick={() => onEscolha('recorra')} className="w-full rounded border border-line p-3 text-left hover:border-primary hover:bg-canvas">
            <div className="text-sm font-medium text-ink">Excluir só no Recorrai</div>
            <div className="text-xs text-muted">Remove o registro daqui. {gerada ? 'A cobrança continua ativa no gateway.' : ''}</div>
          </button>
          {gerada && (
            <button onClick={() => onEscolha('ambos')} className="w-full rounded border border-line p-3 text-left hover:border-danger hover:bg-danger-tint">
              <div className="text-sm font-medium text-ink">Excluir em ambas (Recorrai e gateway)</div>
              <div className="text-xs text-muted">Cancela a cobrança no gateway e apaga o registro daqui.</div>
            </button>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
        </div>
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
