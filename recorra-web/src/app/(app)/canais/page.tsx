'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X, RefreshCw, Trash2, Wifi, WifiOff, Loader2, MessageCircle, Mail, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Conexao { id: string; canal: string; apelido: string; ativo: boolean; status: string; instance?: string | null; origem?: string; oficial?: boolean; nxType?: string }

const TIPOS = [
  { canal: 'WHATSAPP_CLOUD', label: 'WhatsApp API oficial', desc: 'Meta Cloud API — você informa as credenciais.', qr: false, icon: MessageCircle },
  { canal: 'WHATSAPP_EVOLUTION', label: 'WhatsApp (Evolution)', desc: 'Conecte seu número lendo o QR code.', qr: true, icon: MessageCircle },
  { canal: 'WHATSAPP_UAZAPI', label: 'WhatsApp (uazapi)', desc: 'Conecte seu número lendo o QR code.', qr: true, icon: MessageCircle },
  { canal: 'EMAIL', label: 'E-mail', desc: 'Remetente para envio de e-mails.', qr: false, icon: Mail },
  { canal: 'SMS', label: 'SMS', desc: 'Provedor de SMS.', qr: false, icon: Smartphone },
  { canal: 'NX_SYSTEMS', label: 'NX Systems', desc: 'Central de atendimento NX.', qr: false, icon: MessageCircle },
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

  const carregar = useCallback(async () => {
    setLoading(true);
    setLista(await api<Conexao[]>('/canais').catch(() => []));
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizarNx() {
    setSincronizando(true); setSyncMsg('Buscando canais no NX...');
    try {
      const r = await api<{ importados: number; atualizados: number; erros: string[] }>('/canais/sincronizar-nx', { method: 'POST' });
      setSyncMsg(`✓ ${r.importados} novo(s) · ${r.atualizados} atualizado(s)${r.erros?.length ? ` — ${r.erros[0]}` : ''}`);
      carregar();
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'); }
    finally { setSincronizando(false); }
  }

  async function excluir(c: Conexao) {
    const msg = c.origem === 'nx'
      ? `Remover "${c.apelido}" da Recorra? No NX ele permanece — você pode trazer de volta clicando em "Sincronizar canais".`
      : `Remover a conexão "${c.apelido}"?`;
    if (!confirm(msg)) return;
    await api(`/canais/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  const importadosNx = lista.filter((c) => c.origem === 'nx');
  const outros = lista.filter((c) => c.origem !== 'nx');

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

      {importadosNx.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">Canais do NX <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-normal text-primary">{importadosNx.length}</span></h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {importadosNx.map((c) => <CanalCard key={c.id} c={c} onExcluir={excluir} onQr={setQr} />)}
          </div>
        </div>
      )}

      {importadosNx.length > 0 && outros.length > 0 && <h2 className="mb-2 text-sm font-semibold text-ink">Outros canais</h2>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {outros.map((c) => <CanalCard key={c.id} c={c} onExcluir={excluir} onQr={setQr} />)}
        {!loading && lista.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">Nenhum canal conectado. Use "Sincronizar canais (NX)" ou "Adicionar canal".</div>}
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {novo && <NovoCanalModal onClose={() => setNovo(false)} onCreated={(conn) => { setNovo(false); carregar(); const t = TIPOS.find((x) => x.canal === conn.canal); if (t?.qr) setQr(conn); }} />}
      {qr && <QrModal conn={qr} onClose={() => { setQr(null); carregar(); }} />}
    </div>
  );
}

function CanalCard({ c, onExcluir, onQr }: { c: Conexao; onExcluir: (c: Conexao) => void; onQr: (c: Conexao) => void }) {
  const tipo = TIPOS.find((t) => t.canal === c.canal);
  const si = statusInfo[c.status] || statusInfo.CONFIGURADO;
  const SIcon = si.icon;
  const TIcon = tipo?.icon || MessageCircle;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2"><TIcon size={18} className="shrink-0 text-muted" /><span className="truncate font-medium text-ink">{c.apelido}</span></div>
        <button onClick={() => onExcluir(c)} title={c.origem === 'nx' ? 'Remover da Recorra (mantém no NX)' : 'Remover'} className="shrink-0 rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
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
  const [canal, setCanal] = useState('WHATSAPP_EVOLUTION');
  const [apelido, setApelido] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const tipo = TIPOS.find((t) => t.canal === canal)!;

  const camposCred: Record<string, { key: string; label: string }[]> = {
    WHATSAPP_CLOUD: [{ key: 'phoneId', label: 'Phone Number ID' }, { key: 'token', label: 'Token de acesso' }],
    EMAIL: [{ key: 'from', label: 'Remetente (ex: cobranca@seudominio.com)' }],
    SMS: [{ key: 'provider', label: 'Provedor' }, { key: 'apiKey', label: 'API Key' }, { key: 'from', label: 'Remetente' }],
    WHATSAPP_EVOLUTION: [],
    WHATSAPP_UAZAPI: [],
  };

  async function criar() {
    if (!apelido.trim()) return setMsg('Dê um nome para a conexão.');
    setBusy(true); setMsg('');
    try {
      const conn = await api<Conexao>('/canais', { method: 'POST', body: { canal, apelido, credentials: creds } });
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
