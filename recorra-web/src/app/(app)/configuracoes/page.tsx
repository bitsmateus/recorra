'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Row {
  id: string;
  [k: string]: unknown;
}

export default function ConfiguracoesPage() {
  return (
    <div>
      <PageTitle title="Configurações" subtitle="Conecte seu ERP, gateway de pagamento e canais de mensagem" />
      <div className="space-y-6">
        <GatewaySection />
        <ChannelSection />
        <TemplatesSection />
        <IntegrationSection />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

/* ---------- Gateways ---------- */
function GatewaySection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [provider, setProvider] = useState('ASAAS');
  const [ambiente, setAmbiente] = useState('sandbox');
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<Row[]>('/config/gateways').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function salvar() {
    setMsg('Salvando...');
    try {
      await api('/config/gateways', {
        method: 'POST',
        body: { provider, ambiente, credentials: { apiKey, webhookToken } },
      });
      setMsg('✓ Gateway salvo');
      setApiKey('');
      setWebhookToken('');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <Section title="Gateway de pagamento">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Gateway</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="ASAAS">Asaas</option>
            <option value="MERCADO_PAGO">Mercado Pago</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Ambiente</span>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="sandbox">Sandbox</option>
            <option value="production">Produção</option>
          </select>
        </label>
        <Field label="API Key / Access Token" value={apiKey} onChange={setApiKey} placeholder="sua chave do gateway" />
        <Field label="Webhook token (opcional)" value={webhookToken} onChange={setWebhookToken} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Salvar gateway</button>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>
      <ListChips rows={rows} render={(r) => `${r.provider} · ${r.ambiente}`} />
    </Section>
  );
}

/* ---------- Canais ---------- */
function ChannelSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [canal, setCanal] = useState('WHATSAPP_CLOUD');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<Row[]>('/config/canais').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const fields: Record<string, { key: string; label: string }[]> = {
    WHATSAPP_CLOUD: [{ key: 'token', label: 'Token (Meta)' }, { key: 'phoneId', label: 'Phone Number ID' }],
    WHATSAPP_EVOLUTION: [{ key: 'apiUrl', label: 'URL da Evolution' }, { key: 'apiKey', label: 'API Key' }, { key: 'instance', label: 'Instância' }],
    WHATSAPP_UAZAPI: [{ key: 'apiUrl', label: 'URL da uazapi' }, { key: 'token', label: 'Token' }],
    EMAIL: [{ key: 'apiKey', label: 'Resend API Key' }, { key: 'from', label: 'Remetente' }],
    SMS: [{ key: 'apiKey', label: 'Zenvia Token' }, { key: 'from', label: 'Remetente' }],
  };

  async function salvar() {
    setMsg('Salvando...');
    try {
      await api('/config/canais', { method: 'POST', body: { canal, credentials: creds } });
      setMsg('✓ Canal salvo');
      setCreds({});
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <Section title="Canais de mensagem">
      <label className="mb-3 block max-w-xs">
        <span className="mb-1 block text-xs text-muted">Canal</span>
        <select value={canal} onChange={(e) => { setCanal(e.target.value); setCreds({}); }} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="WHATSAPP_CLOUD">WhatsApp Cloud (oficial)</option>
          <option value="WHATSAPP_EVOLUTION">WhatsApp Evolution</option>
          <option value="WHATSAPP_UAZAPI">WhatsApp uazapi</option>
          <option value="EMAIL">E-mail (Resend)</option>
          <option value="SMS">SMS (Zenvia)</option>
        </select>
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {fields[canal].map((f) => (
          <Field key={f.key} label={f.label} value={creds[f.key] ?? ''} onChange={(v) => setCreds((c) => ({ ...c, [f.key]: v }))} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Salvar canal</button>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>
      <ListChips rows={rows} render={(r) => String(r.canal)} />
    </Section>
  );
}

/* ---------- Integrações ERP ---------- */
function IntegrationSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sistema, setSistema] = useState('IXC');
  const [urlBase, setUrlBase] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<Row[]>('/config/integracoes').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function salvar() {
    setMsg('Salvando...');
    try {
      await api('/config/integracoes', { method: 'POST', body: { sistema, urlBase, credentials: { token } } });
      setMsg('✓ Integração salva');
      setToken('');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function testar(id: string) {
    setMsg('Testando...');
    const r = await api<{ ok: boolean }>(`/config/integracoes/${id}/testar`, { method: 'POST' }).catch(() => ({ ok: false }));
    setMsg(r.ok ? '✓ Conexão OK' : '✗ Falha na conexão');
    load();
  }

  return (
    <Section title="Integração com ERP (sistema de origem)">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Sistema</span>
          <select value={sistema} onChange={(e) => setSistema(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="IXC">IXC Soft</option>
            <option value="SGP">SGP</option>
            <option value="HUBSOFT">HubSoft</option>
            <option value="VOALLE">Voalle</option>
            <option value="MKAUTH">MK-Auth</option>
          </select>
        </label>
        <Field label="URL base" value={urlBase} onChange={setUrlBase} placeholder="https://provedor.ixcsoft.com.br" />
        <Field label="Token da API" value={token} onChange={setToken} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Salvar integração</button>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
            <span>{String(r.sistema)} · <span className="text-muted">{String(r.status)}</span></span>
            <button onClick={() => testar(r.id)} className="rounded border border-line px-3 py-1 text-xs hover:bg-canvas">Testar conexão</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Templates HSM ---------- */
function TemplatesSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [nome, setNome] = useState('');
  const [corpo, setCorpo] = useState('');
  const [sugestao, setSugestao] = useState<{ categoria: string; alertaCusto: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = useCallback(() => {
    api<Row[]>('/config/templates').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function sincronizar() {
    setSyncing(true); setSyncMsg('Buscando templates na Meta via NX...');
    try {
      const r = await api<{ canais: number; importados: number; atualizados: number; erros: string[] }>('/config/templates/sincronizar', { method: 'POST' });
      const partes = [`${r.importados} novo(s)`, `${r.atualizados} atualizado(s)`, `${r.canais} WABA(s)`];
      setSyncMsg(`✓ ${partes.join(' · ')}${r.erros?.length ? ` — ${r.erros.length} aviso(s): ${r.erros[0]}` : ''}`);
      load();
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : 'Erro na sincronização'); }
    finally { setSyncing(false); }
  }

  async function categorizar(texto: string) {
    setCorpo(texto);
    if (texto.length > 8) setSugestao(await api('/config/templates/categorizar', { method: 'POST', body: { corpo: texto } }).catch(() => null));
  }
  async function salvar() {
    setMsg('Salvando...');
    try {
      await api('/config/templates', { method: 'POST', body: { nome, corpo } });
      setMsg('✓ Template salvo');
      setNome(''); setCorpo(''); setSugestao(null);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  }

  const catColor: Record<string, string> = { UTILITY: '#0F6E56', MARKETING: '#A32D2D', AUTHENTICATION: '#854F0B' };
  const statusColor: Record<string, { bg: string; fg: string }> = {
    APROVADO: { bg: '#E1F5EE', fg: '#0F6E56' }, PENDENTE: { bg: '#FAEEDA', fg: '#854F0B' },
    REJEITADO: { bg: '#FCEBEB', fg: '#A32D2D' }, RASCUNHO: { bg: '#F1F5F9', fg: '#64748B' },
  };

  return (
    <Section title="Templates do WhatsApp (HSM)">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-tint/40 p-3">
        <div className="flex-1 text-sm text-ink">
          <div className="font-medium">Puxar templates aprovados da Meta</div>
          <div className="text-xs text-muted">Sincroniza os templates da sua WABA (via canal NX) — nome, corpo, categoria e status de aprovação.</div>
        </div>
        <button onClick={sincronizar} disabled={syncing} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
          {syncing ? 'Sincronizando...' : 'Sincronizar do WhatsApp (NX)'}
        </button>
      </div>
      {syncMsg && <p className="mb-3 text-sm text-primary">{syncMsg}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Nome do template" value={nome} onChange={setNome} />
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs text-muted">Corpo (use {'{{nome}}'}, {'{{valor}}'}...)</span>
          <textarea value={corpo} onChange={(e) => categorizar(e.target.value)} rows={2} className="w-full rounded border border-line p-3 text-sm outline-none focus:border-primary" />
        </label>
      </div>
      {sugestao && (
        <p className="mt-2 text-sm">
          Categoria sugerida: <b style={{ color: catColor[sugestao.categoria] }}>{sugestao.categoria}</b>
          {sugestao.alertaCusto && <span className="ml-2 text-danger">⚠ parece cobrança mas caiu em marketing (mais caro) — ajuste o texto</span>}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Salvar template</button>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{String(r.nome)}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {r.status ? <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: (statusColor[String(r.status)] || statusColor.RASCUNHO).bg, color: (statusColor[String(r.status)] || statusColor.RASCUNHO).fg }}>{String(r.status)}</span> : null}
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: '#E1F5EE', color: catColor[String(r.categoria)] || '#0E7C7B' }}>{String(r.categoria)}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ListChips({ rows, render }: { rows: Row[]; render: (r: Row) => string }) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {rows.map((r) => (
        <span key={r.id} className="rounded-full bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
          {render(r)}
        </span>
      ))}
    </div>
  );
}
