'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X, RefreshCw, Trash2, Wifi, WifiOff, Loader2, MessageCircle, Mail, Smartphone, Webhook } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Conexao { id: string; canal: string; apelido: string; ativo: boolean; status: string; instance?: string | null }

const TIPOS = [
  { canal: 'WHATSAPP_CLOUD', label: 'WhatsApp API oficial', desc: 'Meta Cloud API — você informa as credenciais.', qr: false, icon: MessageCircle },
  { canal: 'WHATSAPP_EVOLUTION', label: 'WhatsApp (Evolution)', desc: 'Conecte seu número lendo o QR code.', qr: true, icon: MessageCircle },
  { canal: 'WHATSAPP_UAZAPI', label: 'WhatsApp (uazapi)', desc: 'Conecte seu número lendo o QR code.', qr: true, icon: MessageCircle },
  { canal: 'EMAIL', label: 'E-mail', desc: 'Remetente para envio de e-mails.', qr: false, icon: Mail },
  { canal: 'SMS', label: 'SMS', desc: 'Provedor de SMS.', qr: false, icon: Smartphone },
  { canal: 'HTTP_GENERIC', label: 'API aberta (HTTP)', desc: 'Envie pelo endpoint de qualquer sistema (ex.: NX Digital).', qr: false, icon: Webhook },
];

// Presets do canal HTTP genérico — pré-preenchem os campos avançados.
const HTTP_PRESETS: Record<string, { label: string; url: string; method: string; headers: string; body: string; msgIdPath: string; hint: string }> = {
  nxdigital: {
    label: 'NX Digital',
    url: 'https://api.nxdigital.com.br/v1/messages',
    method: 'POST',
    headers: 'Authorization: Bearer {{token}}',
    body: '{\n  "channel": "WHATSAPP",\n  "to": "{{to}}",\n  "message": "{{text}}"\n}',
    msgIdPath: 'data.id',
    hint: 'Exemplo genérico — confirme a URL, os cabeçalhos e o formato do corpo na documentação da SUA conta NX Digital.',
  },
  custom: {
    label: 'Personalizado',
    url: '',
    method: 'POST',
    headers: 'Authorization: Bearer {{token}}',
    body: '{\n  "to": "{{to}}",\n  "text": "{{text}}"\n}',
    msgIdPath: '',
    hint: 'Configure a URL, os cabeçalhos e o corpo conforme a documentação do sistema que você quer integrar.',
  },
};
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

  const carregar = useCallback(async () => {
    setLoading(true);
    setLista(await api<Conexao[]>('/canais').catch(() => []));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(c: Conexao) {
    if (!confirm(`Remover a conexão "${c.apelido}"?`)) return;
    await api(`/canais/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <PageTitle title="Canais" subtitle="Conecte e monitore seus canais de envio: WhatsApp, e-mail e SMS" />
        <div className="flex gap-2">
          <button onClick={carregar} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas"><RefreshCw size={15} /> Atualizar</button>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Adicionar canal</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => {
          const tipo = TIPOS.find((t) => t.canal === c.canal);
          const si = statusInfo[c.status] || statusInfo.CONFIGURADO;
          const SIcon = si.icon;
          const TIcon = tipo?.icon || MessageCircle;
          return (
            <div key={c.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2"><TIcon size={18} className="text-muted" /><span className="font-medium text-ink">{c.apelido}</span></div>
                <button onClick={() => excluir(c)} className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
              </div>
              <div className="mb-3 text-xs text-muted">{tipo?.label || c.canal}</div>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${si.cls}`}><SIcon size={12} className={c.status === 'CONECTANDO' ? 'animate-spin' : ''} /> {si.label}</span>
                {tipo?.qr && c.status !== 'CONECTADO' && <button onClick={() => setQr(c)} className="text-xs font-medium text-primary hover:underline">Conectar (QR)</button>}
              </div>
            </div>
          );
        })}
        {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">Nenhum canal conectado. Clique em "Adicionar canal".</div>}
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {novo && <NovoCanalModal onClose={() => setNovo(false)} onCreated={(conn) => { setNovo(false); carregar(); const t = TIPOS.find((x) => x.canal === conn.canal); if (t?.qr) setQr(conn); }} />}
      {qr && <QrModal conn={qr} onClose={() => { setQr(null); carregar(); }} />}
    </div>
  );
}

function NovoCanalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Conexao) => void }) {
  const [canal, setCanal] = useState('WHATSAPP_EVOLUTION');
  const [apelido, setApelido] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const tipo = TIPOS.find((t) => t.canal === canal)!;

  // Estado do canal HTTP genérico (API aberta)
  const [preset, setPreset] = useState('nxdigital');
  const [http, setHttp] = useState(() => ({ ...HTTP_PRESETS.nxdigital, token: '', toFormat: 'digits' }));
  function aplicarPreset(p: string) {
    setPreset(p);
    const cfg = HTTP_PRESETS[p];
    setHttp((s) => ({ ...cfg, token: s.token, toFormat: s.toFormat }));
  }
  function parseHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  const camposCred: Record<string, { key: string; label: string }[]> = {
    WHATSAPP_CLOUD: [{ key: 'phoneId', label: 'Phone Number ID' }, { key: 'token', label: 'Token de acesso' }],
    EMAIL: [{ key: 'from', label: 'Remetente (ex: cobranca@seudominio.com)' }],
    SMS: [{ key: 'provider', label: 'Provedor' }, { key: 'apiKey', label: 'API Key' }, { key: 'from', label: 'Remetente' }],
    WHATSAPP_EVOLUTION: [],
    WHATSAPP_UAZAPI: [],
    HTTP_GENERIC: [],
  };

  async function criar() {
    if (!apelido.trim()) return setMsg('Dê um nome para a conexão.');
    let credentials: Record<string, unknown> = creds;
    if (canal === 'HTTP_GENERIC') {
      if (!/^https?:\/\//i.test(http.url.trim())) return setMsg('Informe uma URL de endpoint válida (http/https).');
      if (http.method !== 'GET' && http.body.trim()) {
        try { JSON.parse(http.body); } catch { return setMsg('O corpo (body) precisa ser um JSON válido.'); }
      }
      credentials = {
        httpUrl: http.url.trim(),
        httpMethod: http.method,
        httpHeaders: parseHeaders(http.headers),
        httpBodyTemplate: http.body,
        httpMsgIdPath: http.msgIdPath.trim(),
        httpToFormat: http.toFormat,
        token: http.token,
      };
    }
    setBusy(true); setMsg('');
    try {
      const conn = await api<Conexao>('/canais', { method: 'POST', body: { canal, apelido, credentials } });
      onCreated(conn);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Adicionar canal</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Tipo de canal</span>
          <select value={canal} onChange={(e) => { setCanal(e.target.value); setCreds({}); }} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
            {TIPOS.map((t) => <option key={t.canal} value={t.canal}>{t.label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">{tipo.desc}</span>
        </label>
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da conexão *</span>
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: Comercial, Financeiro" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
        </label>
        {camposCred[canal].map((f) => (
          <label key={f.key} className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">{f.label}</span>
            <input value={creds[f.key] || ''} onChange={(e) => setCreds((s) => ({ ...s, [f.key]: e.target.value }))} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" />
          </label>
        ))}
        {canal === 'HTTP_GENERIC' && (
          <div className="mb-3 space-y-3 rounded-lg border border-line bg-canvas p-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Sistema</span>
              <select value={preset} onChange={(e) => aplicarPreset(e.target.value)} className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary">
                {Object.entries(HTTP_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-warning">{HTTP_PRESETS[preset].hint}</span>
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Token / chave de API</span>
              <input value={http.token} onChange={(e) => setHttp((s) => ({ ...s, token: e.target.value }))} placeholder="Cole aqui — usado onde houver {{token}}" className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary" />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1 text-sm"><span className="mb-1 block text-xs text-muted">Endpoint (URL)</span>
                <input value={http.url} onChange={(e) => setHttp((s) => ({ ...s, url: e.target.value }))} placeholder="https://..." className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary" />
              </label>
              <label className="block w-24 text-sm"><span className="mb-1 block text-xs text-muted">Método</span>
                <select value={http.method} onChange={(e) => setHttp((s) => ({ ...s, method: e.target.value }))} className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary">
                  <option>POST</option><option>PUT</option><option>GET</option>
                </select>
              </label>
            </div>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Cabeçalhos (um por linha, formato Chave: valor)</span>
              <textarea value={http.headers} onChange={(e) => setHttp((s) => ({ ...s, headers: e.target.value }))} rows={2} className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary" />
            </label>
            {http.method !== 'GET' && (
              <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Corpo (JSON) — variáveis: {'{{to}} {{text}} {{token}} {{templateName}} {{templateParams}}'}</span>
                <textarea value={http.body} onChange={(e) => setHttp((s) => ({ ...s, body: e.target.value }))} rows={6} className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary" />
              </label>
            )}
            <div className="flex gap-2">
              <label className="block flex-1 text-sm"><span className="mb-1 block text-xs text-muted">Caminho do ID na resposta (opcional)</span>
                <input value={http.msgIdPath} onChange={(e) => setHttp((s) => ({ ...s, msgIdPath: e.target.value }))} placeholder="ex.: data.id" className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary" />
              </label>
              <label className="block w-40 text-sm"><span className="mb-1 block text-xs text-muted">Formato do telefone</span>
                <select value={http.toFormat} onChange={(e) => setHttp((s) => ({ ...s, toFormat: e.target.value }))} className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-primary">
                  <option value="digits">5511999999999</option>
                  <option value="e164">+5511999999999</option>
                  <option value="raw">Como está</option>
                </select>
              </label>
            </div>
          </div>
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
