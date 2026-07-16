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
const GATEWAYS = [
  { v: 'ASAAS', l: 'Asaas' }, { v: 'MERCADO_PAGO', l: 'Mercado Pago' }, { v: 'EFI', l: 'Efí (Gerencianet)' }, { v: 'STRIPE', l: 'Stripe' },
  { v: 'BANCO_INTER', l: 'Banco Inter' }, { v: 'SICOOB', l: 'Sicoob' }, { v: 'SICREDI', l: 'Sicredi' }, { v: 'BANCO_BRASIL', l: 'Banco do Brasil' },
];
const BANCOS_PIX = ['BANCO_INTER', 'SICOOB', 'SICREDI', 'BANCO_BRASIL'];

function GatewaySection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [provider, setProvider] = useState('ASAAS');
  const [ambiente, setAmbiente] = useState('sandbox');
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [banco, setBanco] = useState({ clientId: '', clientSecret: '', pixKey: '', certPassword: '', appKey: '' });
  const [certBase64, setCertBase64] = useState('');
  const [certName, setCertName] = useState('');
  const [msg, setMsg] = useState('');
  const isBanco = BANCOS_PIX.includes(provider);
  const setB = (k: string, v: string) => setBanco((s) => ({ ...s, [k]: v }));

  const load = useCallback(() => {
    api<Row[]>('/config/gateways').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  function onCert(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      setCertBase64(res.includes(',') ? res.split(',')[1] : res);
      setCertName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function salvar() {
    setMsg('Salvando...');
    const credentials = isBanco
      ? { apiKey: '', clientId: banco.clientId, clientSecret: banco.clientSecret, pixKey: banco.pixKey, certBase64, certPassword: banco.certPassword, ...(provider === 'BANCO_BRASIL' ? { appKey: banco.appKey } : {}) }
      : { apiKey, webhookToken };
    try {
      await api('/config/gateways', { method: 'POST', body: { provider, ambiente, credentials } });
      setMsg('✓ Gateway salvo');
      setApiKey(''); setWebhookToken(''); setBanco({ clientId: '', clientSecret: '', pixKey: '', certPassword: '', appKey: '' }); setCertBase64(''); setCertName('');
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
            {GATEWAYS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Ambiente</span>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="sandbox">Sandbox / Homologação</option>
            <option value="production">Produção</option>
          </select>
        </label>

        {!isBanco ? (
          <>
            <Field label="API Key / Access Token" value={apiKey} onChange={setApiKey} placeholder="sua chave do gateway" />
            <Field label="Webhook token (opcional)" value={webhookToken} onChange={setWebhookToken} />
          </>
        ) : (
          <>
            <Field label="Client ID" value={banco.clientId} onChange={(v) => setB('clientId', v)} />
            <Field label="Client Secret" value={banco.clientSecret} onChange={(v) => setB('clientSecret', v)} />
            <Field label="Chave Pix (recebedora)" value={banco.pixKey} onChange={(v) => setB('pixKey', v)} placeholder="CNPJ, e-mail ou aleatória" />
            <Field label="Senha do certificado (opcional)" value={banco.certPassword} onChange={(v) => setB('certPassword', v)} />
            {provider === 'BANCO_BRASIL' && <Field label="App Key (gw-dev-app-key)" value={banco.appKey} onChange={(v) => setB('appKey', v)} />}
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs text-muted">Certificado mTLS (.p12 / .pfx)</span>
              <input type="file" accept=".p12,.pfx,.pem" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCert(f); }} className="w-full rounded border border-line px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-sm" />
              {certName && <span className="mt-1 block text-xs text-success">✓ {certName}</span>}
            </label>
          </>
        )}
      </div>
      {isBanco && <p className="mt-2 text-xs text-muted">Bancos usam a API Pix (padrão BACEN) com certificado mTLS. O certificado é cifrado antes de salvar. Confira client_id/secret e o ambiente no portal do banco.</p>}
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
