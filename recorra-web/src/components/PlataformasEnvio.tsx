'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Trash2, Loader2, CheckCircle2, AlertCircle, Webhook, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Integ { id: string; canal: string; apelido: string; ativo: boolean; status: string }
type TesteResult = { ok: boolean; mensagem: string };

const CANAIS_ENVIO = ['NX_SYSTEMS', 'HTTP_GENERIC'];
const LABEL: Record<string, { label: string; icon: typeof Webhook }> = {
  NX_SYSTEMS: { label: 'NX Systems', icon: MessageSquare },
  HTTP_GENERIC: { label: 'API genérica (HTTP)', icon: Webhook },
};

/** Seção "Plataformas de envio": integrações de saída (NX Systems e HTTP genérico). */
export default function EnvioIntegracoes() {
  const [lista, setLista] = useState<Integ[]>([]);
  const [loading, setLoading] = useState(true);
  const [escolher, setEscolher] = useState(false);
  const [novo, setNovo] = useState<'NX_SYSTEMS' | 'HTTP_GENERIC' | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<Integ | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const all = await api<Integ[]>('/canais').catch(() => []);
    setLista(all.filter((c) => CANAIS_ENVIO.includes(c.canal)));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(c: Integ) {
    await api(`/canais/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Plataformas de envio de mensagens</h2>
          <p className="text-sm text-muted">Envie WhatsApp pela API de uma central de atendimento (NX Systems) ou de qualquer sistema via HTTP.</p>
        </div>
        <button onClick={() => setEscolher(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Adicionar</button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => {
          const L = LABEL[c.canal] ?? { label: c.canal, icon: Webhook };
          const Icon = L.icon;
          return (
            <div key={c.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2"><Icon size={18} className="text-muted" /><span className="font-medium text-ink">{c.apelido}</span></div>
                <button onClick={() => setConfirmarExclusao(c)} className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
              </div>
              <div className="text-xs text-muted">{L.label}</div>
            </div>
          );
        })}
        {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-8 text-center text-sm text-muted">Nenhuma plataforma de envio configurada.</div>}
      </div>

      {escolher && <EscolherProvedor onClose={() => setEscolher(false)} onPick={(p) => { setEscolher(false); setNovo(p); }} />}
      {novo === 'NX_SYSTEMS' && <NxModal onClose={() => setNovo(null)} onCreated={() => { setNovo(null); carregar(); }} />}
      {novo === 'HTTP_GENERIC' && <GenericoModal onClose={() => setNovo(null)} onCreated={() => { setNovo(null); carregar(); }} />}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Remover plataforma"
          mensagem={<>Remover a integração <b className="text-ink">{confirmarExclusao.apelido}</b>?</>}
          confirmLabel="Remover"
          danger
          onConfirm={() => { const c = confirmarExclusao; setConfirmarExclusao(null); excluir(c); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EscolherProvedor({ onClose, onPick }: { onClose: () => void; onPick: (p: 'NX_SYSTEMS' | 'HTTP_GENERIC') => void }) {
  return (
    <Modal title="Adicionar plataforma de envio" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => onPick('NX_SYSTEMS')} className="rounded-lg border border-line p-4 text-left hover:border-primary hover:bg-canvas">
          <MessageSquare size={20} className="mb-2 text-primary" />
          <div className="font-medium text-ink">NX Systems</div>
          <p className="mt-1 text-xs text-muted">Central de atendimento NX. Você informa a URL base e o token.</p>
        </button>
        <button onClick={() => onPick('HTTP_GENERIC')} className="rounded-lg border border-line p-4 text-left hover:border-primary hover:bg-canvas">
          <Webhook size={20} className="mb-2 text-primary" />
          <div className="font-medium text-ink">API genérica (HTTP)</div>
          <p className="mt-1 text-xs text-muted">Qualquer sistema com endpoint HTTP. Configure URL, cabeçalhos e corpo.</p>
        </button>
      </div>
    </Modal>
  );
}

function TesteMsg({ teste }: { teste: TesteResult | null }) {
  if (!teste) return null;
  return (
    <p className={`mb-2 flex items-center gap-1.5 text-sm ${teste.ok ? 'text-success' : 'text-danger'}`}>
      {teste.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {teste.mensagem}
    </p>
  );
}

const inputCls = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-primary';

function NxModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [apelido, setApelido] = useState('');
  const [oficial, setOficial] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [teste, setTeste] = useState<TesteResult | null>(null);
  const [testando, setTestando] = useState(false);

  async function testar() {
    setTestando(true); setTeste(null);
    try {
      const r = await api<TesteResult>('/canais/testar', { method: 'POST', body: { canal: 'NX_SYSTEMS', credentials: { nxBaseUrl: url, nxToken: token } } });
      setTeste(r);
    } catch (e) { setTeste({ ok: false, mensagem: e instanceof Error ? e.message : 'Erro ao testar' }); }
    setTestando(false);
  }

  async function criar() {
    if (!apelido.trim()) return setMsg('Dê um nome para a integração.');
    setBusy(true); setMsg('');
    try {
      await api('/canais', { method: 'POST', body: { canal: 'NX_SYSTEMS', apelido, credentials: { nxBaseUrl: url, nxToken: token, nxOficial: oficial } } });
      onCreated();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <Modal title="Integração NX Systems" onClose={onClose}>
      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da integração *</span>
        <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: Atendimento NX" className={inputCls} />
      </label>

      <div className="mb-3 text-sm">
        <span className="mb-1 block text-xs text-muted">Tipo de API</span>
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="radio" name="nxtipo" checked={!oficial} onChange={() => setOficial(false)} className="mt-1" />
            <span><span className="font-medium text-ink">Não oficial (Evolution)</span> <span className="block text-xs text-muted">Você conectou lendo o QR Code. Permite texto livre e template.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="radio" name="nxtipo" checked={oficial} onChange={() => setOficial(true)} className="mt-1" />
            <span><span className="font-medium text-ink">Oficial (WhatsApp Business / WABA)</span> <span className="block text-xs text-muted">Número aprovado pela Meta. Só envia por template.</span></span>
          </label>
        </div>
      </div>

      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">URL base</span>
        <input value={url} onChange={(e) => { setUrl(e.target.value); setTeste(null); }} placeholder="https://webapi.nxsystems.com.br/v2/api/external/SEU_APIID" className={`${inputCls} font-mono text-xs`} />
        <span className="mt-1 block text-xs text-muted">Cole a URL do seu servidor (webapi, chatapi ou appapi) já com o seu ApiID.</span>
      </label>
      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Token</span>
        <input value={token} onChange={(e) => { setToken(e.target.value); setTeste(null); }} placeholder="Token de acesso da NX" className={inputCls} />
      </label>

      <TesteMsg teste={teste} />
      {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
      <div className="flex items-center justify-between gap-2">
        <button onClick={testar} disabled={testando || !url} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas disabled:opacity-60">
          {testando ? <Loader2 size={15} className="animate-spin" /> : null} Testar conexão
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={criar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </Modal>
  );
}

const GENERICO_BODY_PADRAO = '{\n  "to": "{{to}}",\n  "text": "{{text}}"\n}';

function GenericoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [apelido, setApelido] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('POST');
  const [headers, setHeaders] = useState('Authorization: Bearer {{token}}');
  const [body, setBody] = useState(GENERICO_BODY_PADRAO);
  const [msgIdPath, setMsgIdPath] = useState('');
  const [toFormat, setToFormat] = useState('digits');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [teste, setTeste] = useState<TesteResult | null>(null);
  const [testando, setTestando] = useState(false);

  function parseHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      if (k) out[k] = line.slice(i + 1).trim();
    }
    return out;
  }

  async function testar() {
    setTestando(true); setTeste(null);
    try {
      const r = await api<TesteResult>('/canais/testar', { method: 'POST', body: { canal: 'HTTP_GENERIC', credentials: { httpUrl: url, token } } });
      setTeste(r);
    } catch (e) { setTeste({ ok: false, mensagem: e instanceof Error ? e.message : 'Erro ao testar' }); }
    setTestando(false);
  }

  async function criar() {
    if (!apelido.trim()) return setMsg('Dê um nome para a integração.');
    if (!/^https?:\/\//i.test(url.trim())) return setMsg('Informe uma URL de endpoint válida (http/https).');
    if (method !== 'GET' && body.trim()) {
      try { JSON.parse(body); } catch { return setMsg('O corpo (body) precisa ser um JSON válido.'); }
    }
    setBusy(true); setMsg('');
    try {
      await api('/canais', {
        method: 'POST',
        body: {
          canal: 'HTTP_GENERIC', apelido,
          credentials: { httpUrl: url.trim(), httpMethod: method, httpHeaders: parseHeaders(headers), httpBodyTemplate: body, httpMsgIdPath: msgIdPath.trim(), httpToFormat: toFormat, token },
        },
      });
      onCreated();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <Modal title="Integração via API genérica (HTTP)" onClose={onClose}>
      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da integração *</span>
        <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: Meu sistema" className={inputCls} />
      </label>
      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Token / chave de API</span>
        <input value={token} onChange={(e) => { setToken(e.target.value); setTeste(null); }} placeholder="Usado onde houver {{token}}" className={inputCls} />
      </label>
      <div className="mb-3 flex gap-2">
        <label className="block flex-1 text-sm"><span className="mb-1 block text-xs text-muted">Endpoint (URL)</span>
          <input value={url} onChange={(e) => { setUrl(e.target.value); setTeste(null); }} placeholder="https://..." className={`${inputCls} font-mono text-xs`} />
        </label>
        <label className="block w-24 text-sm"><span className="mb-1 block text-xs text-muted">Método</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}><option>POST</option><option>PUT</option><option>GET</option></select>
        </label>
      </div>
      <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Cabeçalhos (um por linha, Chave: valor)</span>
        <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} rows={2} className={`${inputCls} font-mono text-xs`} />
      </label>
      {method !== 'GET' && (
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Corpo (JSON) — variáveis: {'{{to}} {{text}} {{token}} {{templateName}} {{templateParams}}'}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} />
        </label>
      )}
      <div className="mb-3 flex gap-2">
        <label className="block flex-1 text-sm"><span className="mb-1 block text-xs text-muted">Caminho do ID na resposta (opcional)</span>
          <input value={msgIdPath} onChange={(e) => setMsgIdPath(e.target.value)} placeholder="ex.: data.id" className={inputCls} />
        </label>
        <label className="block w-40 text-sm"><span className="mb-1 block text-xs text-muted">Formato do telefone</span>
          <select value={toFormat} onChange={(e) => setToFormat(e.target.value)} className={inputCls}>
            <option value="digits">5511999999999</option>
            <option value="e164">+5511999999999</option>
            <option value="raw">Como está</option>
          </select>
        </label>
      </div>

      <TesteMsg teste={teste} />
      {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
      <div className="flex items-center justify-between gap-2">
        <button onClick={testar} disabled={testando || !url} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-canvas disabled:opacity-60">
          {testando ? <Loader2 size={15} className="animate-spin" /> : null} Testar conexão
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={criar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </Modal>
  );
}
