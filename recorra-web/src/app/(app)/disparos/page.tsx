'use client';

import { useEffect, useState, useCallback } from 'react';
import { Filter, X, ChevronLeft, ChevronRight, MessageCircle, Mail, Smartphone, MessageSquare, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, Metric } from '@/components/ui';

interface Row {
  id: string; canal: string; canalNome?: string | null; campanha?: string | null;
  conteudo?: string; status: string; erro?: string; createdAt: string; enviadoEm?: string;
  cliente?: string | null; telefone?: string | null;
}
interface Lista { total: number; page: number; pageSize: number; totalPages: number; rows: Row[] }
interface Resumo { enviados: number; entregues: number; falhas: number; fila: number }

const statusColor: Record<string, string> = {
  FILA: 'bg-warning-tint text-[#854F0B]', ENVIADO: 'bg-success-tint text-[#0F6E56]',
  ENTREGUE: 'bg-success-tint text-[#0F6E56]', LIDO: 'bg-primary-tint text-primary',
  FALHA: 'bg-danger-tint text-[#A32D2D]', IGNORADO: 'bg-canvas text-muted',
};
const tipoDeCanal = (c: string) => (c.startsWith('WHATSAPP') ? 'WHATSAPP' : c);
const canalIcon: Record<string, typeof MessageCircle> = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Smartphone };
const canalTipoLabel: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', SMS: 'SMS' };

const emptyFiltros = { q: '', status: '', tipoCanal: '', channelAccountId: '', campanhaId: '', de: '', ate: '' };

function paginacao(atual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, total - 1, total, atual - 1, atual, atual + 1]);
  const paginas = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of paginas) { if (p - prev > 1) out.push('…'); out.push(p); prev = p; }
  return out;
}

function traduzErro(erro?: string): string {
  const e = (erro || '').toLowerCase();
  if (!e) return 'Falha no envio, sem motivo informado pelo canal.';
  if (e.includes('"exists":false') || e.includes('exists\\":false') || e.includes('number') && e.includes('exists')) return 'Este número não tem WhatsApp (ou o número/DDD está errado). Confira o telefone do cliente.';
  if (e.includes('not connected') || e.includes('connection closed') || e.includes('close') || e.includes('disconnected') || e.includes('state')) return 'O canal (seu número) está desconectado. Reconecte em Canais lendo o QR code de novo.';
  if (e.includes('401') || e.includes('unauthorized') || e.includes('apikey') || e.includes('token')) return 'As credenciais do canal estão inválidas ou expiradas.';
  if (e.includes('429') || e.includes('rate') || e.includes('too many')) return 'Muitos envios em pouco tempo (limite do provedor). Aumente o intervalo entre mensagens na campanha.';
  if (e.includes('sem destino')) return 'O cliente não tem telefone/e-mail cadastrado para este canal.';
  if (e.includes('timeout') || e.includes('etimedout') || e.includes('econnrefused') || e.includes('enotfound') || e.includes('network')) return 'O servidor do canal não respondeu. Pode ser instabilidade — tente reenviar.';
  if (e.includes('400') || e.includes('bad request')) return 'O canal recusou a mensagem (dados inválidos, geralmente o número).';
  return 'Falha no envio pelo canal.';
}

function explicaStatus(status: string, erro?: string, enviadoEm?: string): string {
  switch (status) {
    case 'ENVIADO': return `Enviada com sucesso${enviadoEm ? ' em ' + new Date(enviadoEm).toLocaleString('pt-BR') : ''}.`;
    case 'ENTREGUE': return 'Entregue no aparelho do cliente.';
    case 'LIDO': return 'Lida pelo cliente.';
    case 'FILA': return 'Na fila: aguardando envio. As mensagens saem em segundo plano, respeitando o intervalo configurado na campanha.';
    case 'FALHA': return traduzErro(erro);
    case 'IGNORADO': return 'Ignorada: não havia destino válido para o canal (ex.: cliente sem telefone/e-mail).';
    default: return status;
  }
}

export default function DisparosPage() {
  const [data, setData] = useState<Lista | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [filtros, setFiltros] = useState(emptyFiltros);
  const [page, setPage] = useState(1);
  const [canais, setCanais] = useState<{ id: string; apelido: string; canal: string }[]>([]);
  const [campanhas, setCampanhas] = useState<{ id: string; nome: string }[]>([]);
  const setF = (k: string, v: string) => { setFiltros((s) => ({ ...s, [k]: v })); setPage(1); };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v));
    params.set('page', String(page));
    params.set('pageSize', '20');
    setData(await api<Lista>(`/disparos?${params.toString()}`).catch(() => null));
    setResumo(await api<Resumo>('/disparos/resumo').catch(() => null));
  }, [filtros, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ id: string; apelido: string; canal: string }[]>('/canais').then(setCanais).catch(() => setCanais([]));
    api<{ id: string; nome: string }[]>('/campanhas').then(setCampanhas).catch(() => setCampanhas([]));
  }, []);

  const filtrosAtivos = Object.values(filtros).filter(Boolean).length;
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageTitle title="Disparos" subtitle="Histórico de todas as mensagens enviadas aos seus clientes" />

      {resumo && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Enviados (mês)" value={String(resumo.enviados)} accent="#0F6E56" />
          <Metric label="Entregues" value={String(resumo.entregues)} />
          <Metric label="Falhas" value={String(resumo.falhas)} accent={resumo.falhas > 0 ? '#EF4444' : undefined} />
          <Metric label="Na fila" value={String(resumo.fila)} accent="#F59E0B" />
        </div>
      )}

      <div className="mb-4 rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
          <Filter size={14} /> Filtros {filtrosAtivos > 0 && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-primary">{filtrosAtivos}</span>}
          {filtrosAtivos > 0 && <button onClick={() => { setFiltros(emptyFiltros); setPage(1); }} className="ml-auto flex items-center gap-1 rounded-md border border-danger/40 bg-danger-tint px-3 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-white"><X size={13} /> Limpar filtros</button>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <input placeholder="Cliente / telefone" value={filtros.q} onChange={(e) => setF('q', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary lg:col-span-2" />
          <select value={filtros.campanhaId} onChange={(e) => setF('campanhaId', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Campanha: todas</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          <select value={filtros.tipoCanal} onChange={(e) => setF('tipoCanal', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Tipo: todos</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="SMS">SMS</option></select>
          <select value={filtros.channelAccountId} onChange={(e) => setF('channelAccountId', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Canal: todos</option>{canais.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}</select>
          <select value={filtros.status} onChange={(e) => setF('status', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Status: todos</option><option value="ENVIADO">Enviado</option><option value="ENTREGUE">Entregue</option><option value="LIDO">Lido</option><option value="FALHA">Falha</option><option value="FILA">Na fila</option><option value="IGNORADO">Ignorado</option></select>
          <input type="date" title="De" value={filtros.de} onChange={(e) => setF('de', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="date" title="Até" value={filtros.ate} onChange={(e) => setF('ate', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Canal</th>
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-4 py-3 font-medium">Mensagem</th>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const tipo = tipoDeCanal(d.canal);
              const Icon = canalIcon[tipo] || MessageCircle;
              return (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-3"><div className="font-medium text-ink">{d.cliente || '—'}</div>{d.telefone && <div className="text-xs text-muted">{d.telefone}</div>}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-muted"><Icon size={14} /> {canalTipoLabel[tipo] || d.canal}{d.canalNome && <span className="text-xs text-muted">· {d.canalNome}</span>}</span></td>
                  <td className="px-4 py-3 text-muted">{d.campanha || <span className="text-xs">—</span>}</td>
                  <td className="px-4 py-3">
                    {d.conteudo ? (
                      <div className="group relative inline-block">
                        <button className="flex items-center gap-1 text-xs text-primary hover:underline"><MessageSquare size={13} /> ver mensagem</button>
                        <div className="pointer-events-none absolute left-0 top-6 z-30 hidden w-80 whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 text-xs text-ink shadow-lg group-hover:block">{d.conteudo}</div>
                      </div>
                    ) : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(d.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[d.status] || 'bg-canvas text-muted'}`}>{d.status}</span>
                      <span className="group relative inline-block">
                        <button className="flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-primary"><HelpCircle size={13} /></button>
                        <div className="pointer-events-none absolute right-0 top-6 z-30 hidden w-72 rounded-lg border border-line bg-surface p-2 text-xs shadow-lg group-hover:block">
                          <div className="text-ink">{explicaStatus(d.status, d.erro, d.enviadoEm)}</div>
                          {d.status === 'FALHA' && d.erro && <div className="mt-1.5 border-t border-line pt-1.5 text-[10px] text-muted">Detalhe técnico: {d.erro}</div>}
                        </div>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum disparo encontrado.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {data && data.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">{data.total} disparo(s) · página {data.page} de {data.totalPages}</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:bg-canvas disabled:opacity-30"><ChevronLeft size={16} /></button>
            {paginacao(data.page, data.totalPages).map((p, i) => p === '…'
              ? <span key={`e${i}`} className="px-1 text-muted">…</span>
              : <button key={p} onClick={() => setPage(p)} className={`h-8 min-w-8 rounded border px-2 text-sm ${p === data.page ? 'border-primary bg-primary text-white' : 'border-line text-muted hover:bg-canvas'}`}>{p}</button>)}
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:bg-canvas disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
