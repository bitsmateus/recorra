'use client';

import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, RefreshCw, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Row {
  id: string;
  provider?: string;
  ambiente?: string;
  importLookbackDays?: number | null;
  [k: string]: unknown;
}

interface ImportPreview {
  total: { quantidade: number; valor: number };
  ativas: { quantidade: number; valor: number };
  legado: { quantidade: number; valor: number };
}

const GATEWAYS = [
  { v: 'ASAAS', l: 'Asaas' }, { v: 'MERCADO_PAGO', l: 'Mercado Pago' }, { v: 'EFI', l: 'Efí (Gerencianet)' }, { v: 'STRIPE', l: 'Stripe' },
  { v: 'BANCO_INTER', l: 'Banco Inter' }, { v: 'SICOOB', l: 'Sicoob' }, { v: 'SICREDI', l: 'Sicredi' }, { v: 'BANCO_BRASIL', l: 'Banco do Brasil' },
];
const BANCOS_PIX = ['BANCO_INTER', 'SICOOB', 'SICREDI', 'BANCO_BRASIL'];
const gwLabel = (v: string) => GATEWAYS.find((g) => g.v === v)?.l || v;

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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Row | null>(null);
  const [importando, setImportando] = useState<string | null>(null);
  const [janelas, setJanelas] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const isBanco = BANCOS_PIX.includes(provider);
  const setB = (k: string, v: string) => setBanco((s) => ({ ...s, [k]: v }));

  // URL do webhook: a rota /webhooks é servida fora do prefixo /api, então tiramos o /api do base.
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api\/?$/, '');
  const webhookUrlDe = (r: Row) => `${apiBase}/webhooks/${String(r.provider)}/${r.id}`;
  async function copiarUrl(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopiado(id); setTimeout(() => setCopiado(null), 1500); } catch { /* clipboard indisponível */ }
  }

  const load = useCallback(() => {
    api<Row[]>('/config/gateways').then((data) => {
      setRows(data);
      setJanelas((atual) => Object.fromEntries(data.map((r) => [r.id, atual[r.id] ?? (r.importLookbackDays == null ? 'all' : String(r.importLookbackDays))])));
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);

  function limparCampos() {
    setApiKey(''); setWebhookToken('');
    setBanco({ clientId: '', clientSecret: '', pixKey: '', certPassword: '', appKey: '' });
    setCertBase64(''); setCertName('');
  }
  function iniciarEdicao(r: Row) {
    setEditandoId(r.id);
    setProvider(String(r.provider));
    setAmbiente(String(r.ambiente));
    limparCampos();
    setMsg('Editando — preencha as credenciais só se quiser substituí-las.');
    if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  function cancelarEdicao() { setEditandoId(null); limparCampos(); setMsg(''); }

  async function testar(id: string) {
    setTestando(id); setMsg('Testando conexão...');
    try {
      const r = await api<{ ok: boolean; erro?: string }>(`/config/gateways/${id}/testar`, { method: 'POST' });
      setMsg(r.ok ? '✓ Conexão OK — o gateway está respondendo.' : `✗ Falha na conexão${r.erro ? `: ${r.erro}` : ''}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao testar'); }
    finally { setTestando(null); }
  }
  async function excluir(id: string) {
    await api(`/config/gateways/${id}`, { method: 'DELETE' }).catch(() => {});
    if (editandoId === id) cancelarEdicao();
    load();
  }

  async function importar(r: Row) {
    const raw = janelas[r.id] ?? '30';
    const lookbackDays = raw === 'all' ? null : Number(raw);
    setImportando(r.id);
    setMsg('Calculando prévia da importação...');
    try {
      const previa = await api<ImportPreview>('/cobrancas/importar-gateway/previa', { method: 'POST', body: { accountId: r.id, lookbackDays } });
      const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const ok = window.confirm(
        `Foram encontradas ${previa.total.quantidade} cobranças abertas (${dinheiro(previa.total.valor)}).\n\n` +
        `${previa.ativas.quantidade} ficarão ATIVAS e participarão das cobranças automáticas.\n` +
        `${previa.legado.quantidade} ficarão como LEGADO e não receberão mensagens automáticas.\n\nContinuar?`,
      );
      if (!ok) { setMsg('Importação cancelada.'); return; }
      setMsg('Importando clientes e cobranças...');
      const res = await api<{ faturas: number; faturasAtualizadas: number; ativas: number; legado: number }>('/cobrancas/importar-gateway', {
        method: 'POST', body: { accountId: r.id, lookbackDays },
      });
      setMsg(`✓ Importação concluída: ${res.faturas} novas, ${res.faturasAtualizadas} atualizadas, ${res.ativas} ativas e ${res.legado} em legado.`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao importar cobranças');
    } finally {
      setImportando(null);
    }
  }

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
    // Há credenciais preenchidas? Na edição, sem nada preenchido mantém as atuais.
    const temCreds = isBanco
      ? !!(banco.clientId || banco.clientSecret || banco.pixKey || certBase64 || banco.certPassword)
      : !!(apiKey || webhookToken);
    try {
      if (editandoId) {
        const body: Record<string, unknown> = { ambiente };
        if (temCreds) body.credentials = credentials;
        await api(`/config/gateways/${editandoId}`, { method: 'PATCH', body });
        setMsg('✓ Gateway atualizado');
        setEditandoId(null);
      } else {
        await api('/config/gateways', { method: 'POST', body: { provider, ambiente, credentials } });
        setMsg('✓ Gateway salvo');
      }
      limparCampos();
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  const edicao = !!editandoId;

  return (
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">Gateway de pagamento</h2>
        <p className="text-sm text-muted">Conecte o gateway que gera os Pix/boletos das cobranças dos seus clientes.</p>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-ink">{gwLabel(String(r.provider))}</span>
                <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary">{String(r.ambiente)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => testar(r.id)} disabled={testando === r.id} className="rounded border border-line px-3 py-1 text-xs hover:bg-canvas disabled:opacity-60">{testando === r.id ? 'Testando...' : 'Testar'}</button>
                <button onClick={() => iniciarEdicao(r)} title="Editar gateway" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-ink"><Pencil size={14} /></button>
                <button onClick={() => setConfirmar(r)} title="Remover gateway" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
              </div>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <span className="mb-1 block text-xs text-muted">URL do webhook — cole no painel do {gwLabel(String(r.provider))} para baixa automática dos pagamentos:</span>
                <div className="flex items-center gap-2">
                  <input readOnly value={webhookUrlDe(r)} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1.5 font-mono text-[11px] text-muted outline-none" />
                  <button type="button" onClick={() => copiarUrl(webhookUrlDe(r), r.id)} className="shrink-0 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas">{copiado === r.id ? 'Copiado!' : 'Copiar'}</button>
                </div>
              </div>
              {String(r.provider) === 'ASAAS' && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                      Cobranças vencidas que ficarão ativas
                      <span className="group relative inline-flex">
                        <button type="button" aria-label="O que é uma cobrança legado?" className="text-muted hover:text-primary"><HelpCircle size={13} /></button>
                        <span role="tooltip" className="pointer-events-none absolute bottom-6 left-1/2 z-30 hidden w-72 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal text-ink shadow-lg group-hover:block group-focus-within:block">
                          <b>Legado</b> é uma cobrança antiga trazida apenas para histórico. Ela continua visível e pode receber baixa quando for paga, mas não entra em réguas, campanhas automáticas, risco operacional ou total atual em aberto.
                        </span>
                      </span>
                    </span>
                    <select value={janelas[r.id] ?? '30'} onChange={(e) => setJanelas((s) => ({ ...s, [r.id]: e.target.value }))} className="rounded border border-line px-3 py-1.5 text-xs outline-none focus:border-primary">
                      <option value="0">Somente de hoje em diante</option>
                      <option value="30">Últimos 30 dias (recomendado)</option>
                      <option value="60">Últimos 60 dias</option>
                      <option value="90">Últimos 90 dias</option>
                      <option value="all">Todas as cobranças abertas</option>
                    </select>
                  </label>
                  <button onClick={() => importar(r)} disabled={importando === r.id} className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-60">
                    <RefreshCw size={12} className={importando === r.id ? 'animate-spin' : ''} />
                    {importando === r.id ? 'Importando...' : 'Prévia e importar'}
                  </button>
                  <p className="max-w-xl text-xs text-muted">As anteriores ao período ficam visíveis como legado, mas não entram em réguas ou campanhas automáticas.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{edicao ? `Editar gateway — ${gwLabel(provider)}` : 'Adicionar gateway'}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Gateway</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={edicao} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60">
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
              <Field label="API Key / Access Token" value={apiKey} onChange={setApiKey} placeholder={edicao ? 'Deixe em branco para manter' : 'sua chave do gateway'} />
              <Field label="Webhook token (opcional)" value={webhookToken} onChange={setWebhookToken} placeholder={edicao ? 'Deixe em branco para manter' : undefined} />
            </>
          ) : (
            <>
              <Field label="Client ID" value={banco.clientId} onChange={(v) => setB('clientId', v)} placeholder={edicao ? 'Deixe em branco para manter' : undefined} />
              <Field label="Client Secret" value={banco.clientSecret} onChange={(v) => setB('clientSecret', v)} placeholder={edicao ? 'Deixe em branco para manter' : undefined} />
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
        {edicao && <p className="mt-2 text-xs text-muted">Por segurança, as credenciais salvas não são exibidas. Preencha um campo apenas se quiser substituí-lo.</p>}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">{edicao ? 'Salvar alterações' : 'Salvar gateway'}</button>
          {edicao && <button onClick={cancelarEdicao} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>}
          {msg && <span className="text-sm text-primary">{msg}</span>}
        </div>
      </div>

      {confirmar && (
        <ConfirmDialog
          titulo="Remover gateway"
          mensagem={<>Remover o gateway <b className="text-ink">{gwLabel(String(confirmar.provider))} · {String(confirmar.ambiente)}</b>? As cobranças já geradas não são afetadas.</>}
          confirmLabel="Remover"
          danger
          onConfirm={() => { const r = confirmar; setConfirmar(null); excluir(r.id); }}
          onClose={() => setConfirmar(null)}
        />
      )}
    </section>
  );
}
