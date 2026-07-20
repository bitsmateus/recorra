'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, Pencil, X, Database } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import GatewayPagamento from '@/components/GatewayPagamento';

// ERPs com integração nativa (puxam clientes + cobranças automaticamente).
type CampoCred = { key: string; label: string; placeholder?: string; extra?: boolean };
const ERPS: { id: string; nome: string; desc: string; campos: CampoCred[] }[] = [
  { id: 'IXC', nome: 'IXC Soft', desc: 'API REST. Puxa clientes, boletos, Pix e vencimentos.', campos: [
    { key: 'token', label: 'Token da API', placeholder: 'Token gerado no IXC' },
  ] },
  { id: 'SGP', nome: 'SGP', desc: 'Token em Administração > Integrações > Tokens.', campos: [
    { key: 'token', label: 'Token da API' },
    { key: 'app', label: 'App (opcional)', placeholder: 'recorra', extra: true },
  ] },
  { id: 'HUBSOFT', nome: 'HubSoft', desc: 'API REST com OAuth2 (grant password).', campos: [
    { key: 'client_id', label: 'Client ID', extra: true },
    { key: 'client_secret', label: 'Client Secret', extra: true },
    { key: 'username', label: 'Usuário', extra: true },
    { key: 'password', label: 'Senha', extra: true },
  ] },
  { id: 'VOALLE', nome: 'Voalle', desc: 'API do ERP com OAuth2 (client_credentials).', campos: [
    { key: 'client_id', label: 'Client ID', extra: true },
    { key: 'client_secret', label: 'Client Secret', extra: true },
    { key: 'syndata', label: 'Syndata', extra: true },
  ] },
  { id: 'MKAUTH', nome: 'MK-Auth', desc: 'Requer o add-on de integração no servidor.', campos: [
    { key: 'token', label: 'Token da API (Bearer)' },
  ] },
];

interface Integracao { id: string; sistema: string; urlBase?: string | null; status: string }

export default function IntegracoesPage() {
  const [lista, setLista] = useState<Integracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Integracao | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState<Integracao | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setLista(await api<Integracao[]>('/config/integracoes').catch(() => []));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar(id: string) {
    setMsg('Sincronizando... pode levar alguns segundos.');
    try {
      const r = await api<{ clientes: number; faturas: number }>(`/integracoes/${id}/sincronizar`, { method: 'POST' });
      setMsg(`✓ ${r.clientes} clientes e ${r.faturas} faturas sincronizados`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'); }
  }
  const [testando, setTestando] = useState<string | null>(null);
  async function testar(id: string) {
    setTestando(id);
    setMsg('Testando conexão...');
    try {
      const r = await api<{ ok: boolean; erro?: string }>(`/config/integracoes/${id}/testar`, { method: 'POST' });
      setMsg(r.ok ? '✓ Conexão OK — a integração está respondendo.' : `✗ Falha na conexão${r.erro ? `: ${r.erro}` : ''}`);
      carregar();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao testar'); }
    finally { setTestando(null); }
  }
  async function excluir(i: Integracao) {
    await api(`/config/integracoes/${i.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  return (
    <div>
      <PageTitle title="Integrações" subtitle="Conecte seu ERP para trazer clientes e cobranças automaticamente. Canais de envio ficam em Canais." />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Sistemas de origem (ERP)</h2>
            <p className="text-sm text-muted">Ao conectar, o Recorrai puxa clientes e cobranças do seu ERP automaticamente.</p>
          </div>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Adicionar integração</button>
        </div>
        {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {lista.map((i) => (
            <div key={i.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2"><Database size={18} className="text-muted" /><span className="font-medium text-ink">{erpNome(i.sistema)}</span></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditando(i)} title="Editar integração" className="rounded p-1 text-muted hover:bg-canvas hover:text-ink"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmarExclusao(i)} title="Remover integração" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
                </div>
              </div>
              {i.urlBase && <div className="mb-2 truncate font-mono text-[11px] text-muted">{i.urlBase}</div>}
              <div className="mb-3"><StatusChip status={i.status} /></div>
              <div className="flex gap-2">
                <button onClick={() => testar(i.id)} disabled={testando === i.id} className="rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas disabled:opacity-60">{testando === i.id ? 'Testando...' : 'Testar'}</button>
                <button onClick={() => sincronizar(i.id)} className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"><RefreshCw size={12} /> Sincronizar</button>
              </div>
            </div>
          ))}
          {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">Nenhum ERP conectado. Clique em "Adicionar integração" para começar a puxar seus clientes e cobranças.</div>}
        </div>
      </section>

      <GatewayPagamento />

      {novo && <NovaIntegracaoModal onClose={() => setNovo(false)} onCreated={() => { setNovo(false); carregar(); }} />}
      {editando && <NovaIntegracaoModal editando={editando} onClose={() => setEditando(null)} onCreated={() => { setEditando(null); carregar(); }} />}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Remover integração"
          mensagem={<>Remover a integração <b className="text-ink">{erpNome(confirmarExclusao.sistema)}</b>? Os clientes/faturas já importados permanecem.</>}
          confirmLabel="Remover"
          danger
          onConfirm={() => { const i = confirmarExclusao; setConfirmarExclusao(null); excluir(i); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </div>
  );
}

function erpNome(id: string): string {
  return ERPS.find((e) => e.id === id)?.nome || id;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: 'Conectado', cls: 'bg-success-tint text-[#0F6E56]' },
    configurada: { label: 'Configurado', cls: 'bg-primary-tint text-primary' },
    falha: { label: 'Falha na conexão', cls: 'bg-danger-tint text-[#A32D2D]' },
  };
  const s = map[status] || { label: status, cls: 'bg-canvas text-muted' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';

function NovaIntegracaoModal({ editando, onClose, onCreated }: { editando?: Integracao; onClose: () => void; onCreated: () => void }) {
  const edicao = !!editando;
  // Na edição o sistema é fixo (define o conector) e a URL já vem preenchida.
  const [sistema, setSistema] = useState(editando?.sistema ?? ERPS[0].id);
  const [urlBase, setUrlBase] = useState(editando?.urlBase ?? '');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const erp = ERPS.find((e) => e.id === sistema) ?? ERPS[0];

  function set(k: string, v: string) { setVals((s) => ({ ...s, [k]: v })); }

  async function salvar() {
    if (!/^https?:\/\//i.test(urlBase.trim())) return setMsg('Informe a URL base do ERP (http/https).');
    // Monta credentials: campos "extra" vão em credentials.extra; os demais direto.
    const credentials: Record<string, unknown> = {};
    const extra: Record<string, string> = {};
    for (const c of erp.campos) {
      const v = (vals[c.key] || '').trim();
      if (!v) continue;
      if (c.extra) extra[c.key] = v; else credentials[c.key] = v;
    }
    if (Object.keys(extra).length) credentials.extra = extra;
    setBusy(true); setMsg('');
    try {
      if (edicao) {
        // Sem credenciais preenchidas → mantém as atuais (backend só recifra se vier algo).
        const body: Record<string, unknown> = { urlBase: urlBase.trim() };
        if (Object.keys(credentials).length) body.credentials = credentials;
        await api(`/config/integracoes/${editando!.id}`, { method: 'PATCH', body });
      } else {
        await api('/config/integracoes', { method: 'POST', body: { sistema, urlBase: urlBase.trim(), credentials } });
      }
      onCreated();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{edicao ? `Editar integração — ${erp.nome}` : 'Adicionar integração de origem'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Sistema (ERP)</span>
          <select value={sistema} onChange={(e) => { setSistema(e.target.value); setVals({}); }} disabled={edicao} className={`${inputCls} disabled:opacity-60`}>
            {ERPS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">{erp.desc}</span>
        </label>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">URL base</span>
          <input value={urlBase} onChange={(e) => setUrlBase(e.target.value)} placeholder="https://seu-erp.com.br" className={`${inputCls} font-mono text-xs`} />
        </label>

        {erp.campos.map((c) => (
          <label key={c.key} className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">{c.label}</span>
            <input value={vals[c.key] || ''} onChange={(e) => set(c.key, e.target.value)} placeholder={edicao ? 'Deixe em branco para manter o atual' : c.placeholder} className={inputCls} />
          </label>
        ))}

        {edicao && <p className="mb-2 text-xs text-muted">Por segurança, as credenciais salvas não são exibidas. Preencha um campo apenas se quiser substituí-lo.</p>}
        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
        </div>
        <p className="mt-3 text-xs text-muted">Depois de salvar, use <b>Testar</b> para validar e <b>Sincronizar</b> para puxar os clientes e cobranças.</p>
      </div>
    </div>
  );
}
