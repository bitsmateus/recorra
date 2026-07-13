'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { UserPlus, Download, RefreshCw, Eye, Pencil, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, RiskBadge } from '@/components/ui';
import { ImportWizard } from '@/components/ImportWizard';

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

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Customer[]>([]);
  const [riscos, setRiscos] = useState<Record<string, RiskScore | null>>({});
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ q: '', uf: '', plano: '', etiqueta: '', valorMin: '', faixa: '' });
  const [modal, setModal] = useState<{ open: boolean; edit?: Customer | null }>({ open: false });
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [importModal, setImportModal] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [etiquetas, setEtiquetas] = useState<{ nome: string }[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v));
    const list = await api<Customer[]>(`/clientes?${params.toString()}`).catch(() => []);
    setClientes(list);
    setLoading(false);
    const map: Record<string, RiskScore | null> = {};
    await Promise.all(list.slice(0, 50).map(async (c) => {
      map[c.id] = await api<RiskScore | null>(`/clientes/${c.id}/risco`).catch(() => null);
    }));
    setRiscos(map);
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api<Gateway[]>('/config/gateways').then(setGateways).catch(() => setGateways([]));
    api<{ nome: string }[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([]));
  }, []);

  async function excluir(c: Customer) {
    if (!confirm(`Excluir o cliente ${c.nome}? Isso remove faturas e histórico dele.`)) return;
    await api(`/clientes/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  function recarregarTudo() {
    carregar();
    api<{ nome: string }[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => {});
  }

  return (
    <div>
      <PageTitle title="Clientes" subtitle="Base de clientes, segmentação e faixa de risco (IA)" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setModal({ open: true, edit: null })} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><UserPlus size={16} /> Novo cliente</button>
        <button onClick={() => setWizard(true)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importar (Excel/CSV)</button>
        {gateways.length > 0 && <button onClick={() => setImportModal(true)} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><Download size={16} /> Importar de gateway</button>}
        <button onClick={async () => { await api('/clientes/risco/recalcular-todos', { method: 'POST' }).catch(() => {}); carregar(); }} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas"><RefreshCw size={16} /> Recalcular risco</button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <input placeholder="Buscar" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <input placeholder="Plano" value={filtros.plano} onChange={(e) => setFiltros({ ...filtros, plano: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <select value={filtros.uf} onChange={(e) => setFiltros({ ...filtros, uf: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">{UFS.map((u) => <option key={u} value={u}>{u || 'UF'}</option>)}</select>
        <select value={filtros.etiqueta} onChange={(e) => setFiltros({ ...filtros, etiqueta: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Etiqueta: todas</option>{etiquetas.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}</select>
        <input placeholder="Valor mín" value={filtros.valorMin} onChange={(e) => setFiltros({ ...filtros, valorMin: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <select value={filtros.faixa} onChange={(e) => setFiltros({ ...filtros, faixa: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Risco: todos</option><option value="BOM">Bom pagador</option><option value="ATENCAO">Atenção</option><option value="RISCO">Risco</option></select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">Documento</th><th className="px-4 py-3 font-medium">Plano / UF</th><th className="px-4 py-3 font-medium">Cobranças</th><th className="px-4 py-3 font-medium">Risco</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{c.nome}{c.tags && c.tags.length > 0 && <span className="ml-2 space-x-1">{c.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-primary-tint px-1.5 py-0.5 text-[10px] text-primary">{t}</span>)}</span>}</td>
                <td className="tabular px-4 py-3 text-muted">{c.doc}</td>
                <td className="px-4 py-3 text-muted">{c.plano || '—'} {c.uf ? `· ${c.uf}` : ''}</td>
                <td className="px-4 py-3">
                  <span className="tabular font-medium text-ink">{c.cobrancasTotal ?? 0}</span>
                  <span className="text-muted"> criadas · </span>
                  <span className="tabular font-medium text-success">{c.cobrancasPagas ?? 0}</span>
                  <span className="text-muted"> pagas</span>
                </td>
                <td className="px-4 py-3"><RiskBadge faixa={riscos[c.id]?.faixa} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/clientes/${c.id}`} title="Ver detalhes" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Eye size={16} /></Link>
                    <button onClick={() => setModal({ open: true, edit: c })} title="Editar" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Pencil size={16} /></button>
                    <button onClick={() => excluir(c)} title="Excluir" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && clientes.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum cliente encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {modal.open && <CustomerModal edit={modal.edit} onClose={() => setModal({ open: false })} onSaved={() => { setModal({ open: false }); recarregarTudo(); }} />}
      {importModal && <ImportGatewayModal gateways={gateways} onClose={() => setImportModal(false)} onDone={() => { setImportModal(false); recarregarTudo(); }} />}
      {wizard && <ImportWizard criarCobrancas={false} onClose={() => setWizard(false)} onDone={() => { setWizard(false); recarregarTudo(); }} />}
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
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Importar de gateway</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-muted">Puxa clientes e cobranças existentes do gateway escolhido para o Recorra (deduplica por CPF/CNPJ).</p>
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

function CustomerModal({ edit, onClose, onSaved }: { edit?: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome: edit?.nome || '', doc: edit?.doc || '', email: edit?.email || '', telefone: edit?.telefone || '',
    plano: edit?.plano || '', valorPlano: edit?.valorPlano ? String(edit.valorPlano) : '', cidade: edit?.cidade || '', uf: edit?.uf || '', tags: (edit?.tags || []).join(', '),
  });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function salvar() {
    setSaving(true); setMsg('');
    const body = { ...f, valorPlano: f.valorPlano ? Number(f.valorPlano) : undefined, tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] };
    try {
      if (edit) await api(`/clientes/${edit.id}`, { method: 'PUT', body });
      else await api('/clientes', { method: 'POST', body });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
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
          <label className="text-sm md:col-span-2"><span className="mb-1 block text-xs text-muted">Etiquetas (separadas por vírgula)</span><input value={f.tags} onChange={(e) => set('tags', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
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
