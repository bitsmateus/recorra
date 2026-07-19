'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Row {
  id: string;
  [k: string]: unknown;
}

const GATEWAYS = [
  { v: 'ASAAS', l: 'Asaas' }, { v: 'MERCADO_PAGO', l: 'Mercado Pago' }, { v: 'EFI', l: 'Efí (Gerencianet)' }, { v: 'STRIPE', l: 'Stripe' },
  { v: 'BANCO_INTER', l: 'Banco Inter' }, { v: 'SICOOB', l: 'Sicoob' }, { v: 'SICREDI', l: 'Sicredi' }, { v: 'BANCO_BRASIL', l: 'Banco do Brasil' },
];
const BANCOS_PIX = ['BANCO_INTER', 'SICOOB', 'SICREDI', 'BANCO_BRASIL'];

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

/**
 * Gateway de pagamento — cadastro das contas de gateway do tenant.
 *
 * Antes vivia em "Configurações"; agora fica aqui em Integrações, junto do ERP.
 * Usa os mesmos endpoints /config/gateways (GET/POST) — nada mudou no backend.
 */
export default function GatewayPagamento() {
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
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">Gateway de pagamento</h2>
        <p className="text-sm text-muted">Conecte o gateway que gera os Pix/boletos das cobranças dos seus clientes.</p>
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
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
        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {rows.map((r) => (
              <span key={r.id} className="rounded-full bg-primary-tint px-3 py-1 text-xs font-medium text-primary">{String(r.provider)} · {String(r.ambiente)}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
