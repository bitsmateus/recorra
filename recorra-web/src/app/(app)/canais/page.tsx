'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X, RefreshCw, Trash2, Wifi, WifiOff, Loader2, MessageCircle, Mail, Smartphone, Plug, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import PlataformasEnvio from '@/components/PlataformasEnvio';
import ConfirmacaoPagamento from '@/components/ConfirmacaoPagamento';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Conexao { id: string; canal: string; apelido: string; ativo: boolean; status: string; instance?: string | null; origem?: string; oficial?: boolean; nxType?: string }

// Opções para criar um novo canal. A Recorrai envia só por API oficial: WhatsApp
// não oficial (Evolution/uazapi) foi removido — sem QR code, sem texto livre no WhatsApp.
const TIPOS = [
  { canal: 'WHATSAPP_CLOUD', label: 'WhatsApp API oficial', desc: 'Meta Cloud API — você informa as credenciais.', qr: false, icon: MessageCircle },
  { canal: 'EMAIL', label: 'E-mail', desc: 'Envie por Resend (API) ou pelo seu servidor SMTP.', qr: false, icon: Mail },
  { canal: 'SMS', label: 'SMS', desc: 'Provedor de SMS.', qr: false, icon: Smartphone },
];

// NX e HTTP são criados na seção "Plataformas de envio". Evolution/uazapi não são mais
// criáveis, mas o rótulo fica para exibir canais legados que ainda existam no banco.
const TIPOS_LABEL = [
  ...TIPOS,
  { canal: 'WHATSAPP_EVOLUTION', label: 'WhatsApp (Evolution)', desc: '', qr: false, icon: MessageCircle },
  { canal: 'WHATSAPP_UAZAPI', label: 'WhatsApp (uazapi)', desc: '', qr: false, icon: MessageCircle },
  { canal: 'NX_SYSTEMS', label: 'NX Systems', desc: '', qr: false, icon: MessageCircle },
  { canal: 'HTTP_GENERIC', label: 'API genérica (HTTP)', desc: '', qr: false, icon: MessageCircle },
];
const statusInfo: Record<string, { label: string; cls: string; icon: typeof Wifi }> = {
  CONECTADO: { label: 'Conectado', cls: 'bg-success-tint text-[#0F6E56]', icon: Wifi },
  CONECTANDO: { label: 'Conectando', cls: 'bg-warning-tint text-[#854F0B]', icon: Loader2 },
  DESCONECTADO: { label: 'Desconectado', cls: 'bg-danger-tint text-[#A32D2D]', icon: WifiOff },
  CONFIGURADO: { label: 'Configurado', cls: 'bg-primary-tint text-primary', icon: Wifi },
};

export default function CanaisPage() {
  const [lista, setLista] = useState<Conexao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState(false);
  const [qr, setQr] = useState<Conexao | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState<Conexao | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setLista(await api<Conexao[]>('/canais').catch(() => []));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizarNx() {
    setSincronizando(true); setSyncMsg('Buscando canais no NX...');
    try {
      const r = await api<{ importados: number; atualizados: number; ignorados?: number; removidos?: number; erros: string[] }>('/canais/sincronizar-nx', { method: 'POST' });
      const partes = [`${r.importados} novo(s)`, `${r.atualizados} atualizado(s)`];
      if (r.removidos) partes.push(`${r.removidos} não oficial(is) removido(s)`);
      if (r.ignorados) partes.push(`${r.ignorados} não oficial(is) ignorado(s)`);
      setSyncMsg(`✓ ${partes.join(' · ')}${r.erros?.length ? ` — ${r.erros[0]}` : ''}`);
      carregar();
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'); }
    finally { setSincronizando(false); }
  }

  /** O que remover significa muda conforme a origem do canal. */
  function avisoExclusao(c: Conexao): React.ReactNode {
    const nome = <b className="text-ink">{c.apelido}</b>;
    if (c.canal === 'NX_SYSTEMS' && c.origem !== 'nx')
      return <>Remover a integração NX {nome}? Isso desliga a sincronização de canais (a URL e o token serão apagados da Recorrai). Os canais já importados continuam, mas não dá para sincronizar de novo sem reconfigurar.</>;
    if (c.origem === 'nx')
      return <>Remover {nome} da Recorrai? No NX ele permanece — você pode trazer de volta clicando em &quot;Sincronizar canais&quot;.</>;
    return <>Remover a conexão {nome}?</>;
  }

  async function excluir(c: Conexao) {
    await api(`/canais/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  const importadosNx = lista.filter((c) => c.origem === 'nx');
  const basesNx = lista.filter((c) => c.canal === 'NX_SYSTEMS' && c.origem !== 'nx');
  // NX e HTTP genérico aparecem na seção "Plataformas de envio" (abaixo), não aqui.
  const outros = lista.filter((c) => c.canal !== 'NX_SYSTEMS' && c.canal !== 'HTTP_GENERIC');

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Canais" subtitle="Conecte e monitore seus canais de envio: WhatsApp, e-mail e SMS" />
        <div className="flex flex-wrap gap-2">
          <button onClick={sincronizarNx} disabled={sincronizando} className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary-tint px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-60"><RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} /> Sincronizar canais (NX)</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas"><RefreshCw size={15} /> Atualizar</button>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Adicionar canal</button>
        </div>
      </div>
      {syncMsg && <p className="mb-3 text-sm text-primary">{syncMsg}</p>}

      {/* Integração NX (URL + token) — fonte da sincronização, não é um canal de envio */}
      {basesNx.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
          <Plug size={16} className="text-muted" />
          <span className="text-sm font-medium text-ink">Integração NX</span>
          {basesNx.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
              {b.apelido}
              <span className={`h-1.5 w-1.5 rounded-full ${b.status === 'CONECTADO' ? 'bg-success' : 'bg-primary'}`} />
              <button onClick={() => setConfirmarExclusao(b)} title="Remover integração" className="text-muted hover:text-danger"><X size={12} /></button>
            </span>
          ))}
          <span className="text-xs text-muted">Guarda a URL + token usados para sincronizar os canais. Não é um canal de envio.</span>
        </div>
      )}

      {importadosNx.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">Canais do NX <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-normal text-primary">{importadosNx.length}</span></h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {importadosNx.map((c) => <CanalCard key={c.id} c={c} onExcluir={setConfirmarExclusao} onQr={setQr} />)}
          </div>
        </div>
      )}

      {importadosNx.length > 0 && outros.length > 0 && <h2 className="mb-2 text-sm font-semibold text-ink">Outros canais</h2>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {outros.map((c) => <CanalCard key={c.id} c={c} onExcluir={setConfirmarExclusao} onQr={setQr} />)}
        {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">Nenhum canal conectado. Use "Sincronizar canais (NX)" ou "Adicionar canal".</div>}
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {/* Plataformas de envio (NX Systems / API genérica) — antes ficavam em Integrações. */}
      <PlataformasEnvio />

      {/* Mensagem automática de "pagamento recebido" (texto e canal configuráveis). */}
      <ConfirmacaoPagamento />

      {novo && <NovoCanalModal onClose={() => setNovo(false)} onCreated={(conn) => { setNovo(false); carregar(); const t = TIPOS.find((x) => x.canal === conn.canal); if (t?.qr) setQr(conn); }} />}
      {qr && <QrModal conn={qr} onClose={() => { setQr(null); carregar(); }} />}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Remover canal"
          mensagem={avisoExclusao(confirmarExclusao)}
          confirmLabel="Remover"
          danger
          onConfirm={() => { const c = confirmarExclusao; setConfirmarExclusao(null); excluir(c); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </div>
  );
}

function CanalCard({ c, onExcluir, onQr }: { c: Conexao; onExcluir: (c: Conexao) => void; onQr: (c: Conexao) => void }) {
  const tipo = TIPOS_LABEL.find((t) => t.canal === c.canal);
  const si = statusInfo[c.status] || statusInfo.CONFIGURADO;
  const SIcon = si.icon;
  const TIcon = tipo?.icon || MessageCircle;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2"><TIcon size={18} className="shrink-0 text-muted" /><span className="truncate font-medium text-ink">{c.apelido}</span></div>
        <button onClick={() => onExcluir(c)} title={c.origem === 'nx' ? 'Remover da Recorrai (mantém no NX)' : 'Remover'} className="shrink-0 rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span>{tipo?.label || c.canal}</span>
        {c.origem === 'nx' && <span className="rounded-full bg-primary-tint px-1.5 py-0.5 font-medium text-primary">NX</span>}
        {c.oficial === true && <span className="rounded-full bg-success-tint px-1.5 py-0.5 font-medium text-[#0F6E56]">Oficial (WABA)</span>}
        {c.oficial === false && c.origem === 'nx' && <span className="rounded-full bg-canvas px-1.5 py-0.5 font-medium text-muted">Não oficial</span>}
      </div>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${si.cls}`}><SIcon size={12} className={c.status === 'CONECTANDO' ? 'animate-spin' : ''} /> {si.label}</span>
        {tipo?.qr && c.status !== 'CONECTADO' && <button onClick={() => onQr(c)} className="text-xs font-medium text-primary hover:underline">Conectar (QR)</button>}
      </div>
    </div>
  );
}

function NovoCanalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Conexao) => void }) {
  const [canal, setCanal] = useState('WHATSAPP_CLOUD');
  const [apelido, setApelido] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [emailProvider, setEmailProvider] = useState<'resend' | 'smtp'>('resend');
  const [testePara, setTestePara] = useState('');
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const tipo = TIPOS.find((t) => t.canal === canal)!;
  const isEmail = canal === 'EMAIL';
  const isCloud = canal === 'WHATSAPP_CLOUD';

  // E-mail tem UI própria (Resend x SMTP); os demais usam campos simples.
  const camposCred: Record<string, { key: string; label: string; placeholder?: string }[]> = {
    // wabaId é opcional: só serve para gerenciar templates, e tentamos descobrir
    // sozinhos pelo phoneId ao salvar. O envio nunca precisa dele.
    WHATSAPP_CLOUD: [{ key: 'phoneId', label: 'Phone Number ID' }, { key: 'token', label: 'Token de acesso' }, { key: 'wabaId', label: 'WABA ID (opcional — para gerenciar templates)' }],
    SMS: [{ key: 'provider', label: 'Provedor' }, { key: 'apiKey', label: 'API Key' }, { key: 'from', label: 'Remetente' }],
    EMAIL: [],
    WHATSAPP_EVOLUTION: [], // conecta por QR code
    WHATSAPP_UAZAPI: [], // conecta por QR code
  };
  const camposEmail: Record<'resend' | 'smtp', { key: string; label: string; placeholder?: string }[]> = {
    resend: [{ key: 'apiKey', label: 'API Key do Resend', placeholder: 're_...' }],
    smtp: [
      { key: 'smtpHost', label: 'Servidor SMTP', placeholder: 'smtp.seudominio.com' },
      { key: 'smtpPort', label: 'Porta', placeholder: '587' },
      { key: 'smtpUser', label: 'Usuário' },
      { key: 'smtpPass', label: 'Senha' },
    ],
  };

  /** Monta as credenciais de e-mail conforme o provedor escolhido (Resend x SMTP). */
  function credenciaisEmail(): Record<string, unknown> {
    const porta = Number(creds.smtpPort || 587);
    return emailProvider === 'smtp'
      ? { emailProvider: 'smtp', from: creds.from, smtpHost: creds.smtpHost, smtpPort: porta, smtpSecure: porta === 465, smtpUser: creds.smtpUser, smtpPass: creds.smtpPass }
      : { emailProvider: 'resend', from: creds.from, apiKey: creds.apiKey };
  }

  async function testarEmail() {
    setTestando(true); setTeste(null);
    try {
      const r = await api<{ ok: boolean; mensagem: string }>('/canais/testar-email', { method: 'POST', body: { credentials: credenciaisEmail(), para: testePara } });
      setTeste(r);
    } catch (e) { setTeste({ ok: false, mensagem: e instanceof Error ? e.message : 'Erro ao testar' }); }
    setTestando(false);
  }

  /** Valida phoneId + token na Meta (não envia mensagem). */
  async function testarWhatsApp() {
    setTestando(true); setTeste(null);
    try {
      const r = await api<{ ok: boolean; mensagem: string }>('/canais/testar-whatsapp', { method: 'POST', body: { credentials: creds } });
      setTeste(r);
    } catch (e) { setTeste({ ok: false, mensagem: e instanceof Error ? e.message : 'Erro ao testar' }); }
    setTestando(false);
  }

  async function criar() {
    if (!apelido.trim()) return setMsg('Dê um nome para a conexão.');
    setBusy(true); setMsg('');
    const credentials: Record<string, unknown> = isEmail ? credenciaisEmail() : creds;
    try {
      const conn = await api<Conexao>('/canais', { method: 'POST', body: { canal, apelido, credentials } });
      onCreated(conn);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Adicionar canal</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Tipo de canal</span>
          <select value={canal} onChange={(e) => { setCanal(e.target.value); setCreds({}); setTeste(null); }} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
            {TIPOS.map((t) => <option key={t.canal} value={t.canal}>{t.label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">{tipo.desc}</span>
        </label>
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da conexão *</span>
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: Comercial, Financeiro" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
        </label>
        {isEmail ? (
          <>
            <div className="mb-3 text-sm">
              <span className="mb-1 block text-xs text-muted">Como enviar</span>
              <div className="space-y-2 rounded-lg border border-line p-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="emailprov" checked={emailProvider === 'resend'} onChange={() => setEmailProvider('resend')} className="mt-1" />
                  <span><span className="font-medium text-ink">Resend (API)</span><span className="block text-xs text-muted">Mais simples: só a API key. Entrega alta, sem servidor próprio.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="emailprov" checked={emailProvider === 'smtp'} onChange={() => setEmailProvider('smtp')} className="mt-1" />
                  <span><span className="font-medium text-ink">SMTP próprio</span><span className="block text-xs text-muted">Use o servidor de e-mail da sua empresa (host, porta, usuário e senha).</span></span>
                </label>
              </div>
            </div>
            <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Remetente (De)</span>
              <input value={creds.from || ''} onChange={(e) => setCreds((s) => ({ ...s, from: e.target.value }))} placeholder="Cobrança <cobranca@seudominio.com>" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
            </label>
            {camposEmail[emailProvider].map((f) => (
              <label key={f.key} className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">{f.label}</span>
                <input value={creds[f.key] || ''} onChange={(e) => setCreds((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
              </label>
            ))}
            {emailProvider === 'smtp' && <p className="mb-3 rounded bg-canvas px-3 py-2 text-xs text-muted">Porta 587 usa STARTTLS; 465 usa SSL. A senha é cifrada antes de salvar.</p>}

            {/* Teste real: envia um e-mail com estas credenciais antes de salvar. */}
            <div className="mb-3 rounded-lg border border-line p-3">
              <span className="mb-1 block text-xs text-muted">Testar envio (opcional)</span>
              <div className="flex gap-2">
                <input value={testePara} onChange={(e) => { setTestePara(e.target.value); setTeste(null); }} placeholder="seu@email.com" className="flex-1 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={testarEmail} disabled={testando || !testePara.trim()} className="flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm hover:bg-canvas disabled:opacity-60">
                  {testando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {testando ? 'Enviando...' : 'Enviar teste'}
                </button>
              </div>
              {teste && (
                <p className={`mt-2 flex items-start gap-1.5 text-xs ${teste.ok ? 'text-success' : 'text-danger'}`}>
                  {teste.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <AlertCircle size={14} className="mt-px shrink-0" />} {teste.mensagem}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            {camposCred[canal].map((f) => (
              <label key={f.key} className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">{f.label}</span>
                <input value={creds[f.key] || ''} onChange={(e) => { setCreds((s) => ({ ...s, [f.key]: e.target.value })); setTeste(null); }} placeholder={f.placeholder} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
              </label>
            ))}
            {/* Valida as credenciais na Meta antes de salvar (não envia mensagem). */}
            {isCloud && (
              <div className="mb-3 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">Confira o número e o token na Meta antes de salvar.</span>
                  <button type="button" onClick={testarWhatsApp} disabled={testando || !creds.phoneId || !creds.token} className="flex shrink-0 items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm hover:bg-canvas disabled:opacity-60">
                    {testando ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />} {testando ? 'Testando...' : 'Testar conexão'}
                  </button>
                </div>
                {teste && (
                  <p className={`mt-2 flex items-start gap-1.5 text-xs ${teste.ok ? 'text-success' : 'text-danger'}`}>
                    {teste.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <AlertCircle size={14} className="mt-px shrink-0" />} {teste.mensagem}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {tipo.qr && <p className="mb-3 rounded bg-canvas px-3 py-2 text-xs text-muted">Ao criar, vamos abrir o QR code para você conectar o número no WhatsApp do celular.</p>}
        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={criar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Criando...' : 'Criar'}</button>
        </div>
      </div>
    </div>
  );
}

function QrModal({ conn, onClose }: { conn: Conexao; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState('CONECTANDO');
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function carregarQr() {
    try {
      const r = await api<{ qr: string | null; code?: string }>(`/canais/${conn.id}/qrcode`);
      if (r.qr) setQr(r.qr.startsWith('data:') ? r.qr : `data:image/png;base64,${r.qr}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao obter QR'); }
  }
  useEffect(() => {
    carregarQr();
    timer.current = setInterval(async () => {
      const s = await api<{ status: string }>(`/canais/${conn.id}/status`).catch(() => ({ status: 'DESCONECTADO' }));
      setStatus(s.status);
      if (s.status === 'CONECTADO') { if (timer.current) clearInterval(timer.current); }
    }, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [conn.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Conectar {conn.apelido}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        {status === 'CONECTADO' ? (
          <div className="py-8">
            <Wifi size={40} className="mx-auto mb-3 text-success" />
            <p className="font-medium text-ink">Número conectado!</p>
            <button onClick={onClose} className="mt-4 rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover">Concluir</button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho, e aponte para o QR:</p>
            {qr ? <img src={qr} alt="QR code" className="mx-auto h-56 w-56 rounded border border-line" /> : <div className="mx-auto flex h-56 w-56 items-center justify-center rounded border border-dashed border-line text-sm text-muted">{msg || 'Gerando QR...'}</div>}
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> Aguardando leitura...</div>
            <button onClick={carregarQr} className="mt-3 text-xs font-medium text-primary hover:underline">Gerar novo QR</button>
          </>
        )}
      </div>
    </div>
  );
}
