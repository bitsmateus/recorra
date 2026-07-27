'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronsLeft, Download, Filter, HelpCircle, Loader2, Mail, MessageCircle, MessageSquare, Smartphone, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { PageTitle } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/** Linhas por página. O backend aceita até 100, mas passar disso só faz a tabela
 *  crescer sem ninguém rolar — quem precisa de volume usa o CSV. */
const POR_PAGINA = 20;
const EXPORT_MAX = 20000;

interface Row {
  id: string; canal: string; canalNome?: string | null; campanha?: string | null; regua?: string | null; origem?: string | null;
  conteudo?: string | null; conteudoTruncado?: boolean; status: string; erro?: string | null; createdAt: string; enviadoEm?: string | null;
  cliente?: string | null; telefone?: string | null;
}
interface Lista { rows: Row[]; pageSize: number; nextCursor: string | null; total?: number }
interface Resumo { enviados: number; entregues: number; falhas: number; fila: number; ignorados: number; total: number }

const statusColor: Record<string, string> = {
  FILA: 'bg-warning-tint text-[#854F0B]', ENVIADO: 'bg-success-tint text-[#0F6E56]',
  ENTREGUE: 'bg-success-tint text-[#0F6E56]', LIDO: 'bg-primary-tint text-primary',
  FALHA: 'bg-danger-tint text-[#A32D2D]', IGNORADO: 'bg-canvas text-muted',
};
const tipoDeCanal = (c: string) => (c.startsWith('WHATSAPP') ? 'WHATSAPP' : c);
const canalIcon: Record<string, typeof MessageCircle> = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Smartphone };
const canalTipoLabel: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', SMS: 'SMS' };

const PERIODOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'tudo', label: 'Tudo' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Traduz o atalho de período em datas. A tela abre em "30 dias" de propósito:
 * listar o histórico inteiro por padrão é o que deixa a página lenta, e quase
 * ninguém procura um disparo de um ano atrás sem antes filtrar. "Tudo" continua
 * a um clique de distância.
 */
function intervalo(periodo: string, de: string, ate: string): { de: string; ate: string } {
  if (periodo === 'custom') return { de, ate };
  if (periodo === 'tudo') return { de: '', ate: '' };
  const hoje = new Date();
  if (periodo === 'hoje') return { de: iso(hoje), ate: iso(hoje) };
  if (periodo === 'mes') return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) };
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (periodo === '7d' ? 6 : 29));
  return { de: iso(inicio), ate: iso(hoje) };
}

function traduzErro(erro?: string | null): string {
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

function explicaStatus(status: string, erro?: string | null, enviadoEm?: string | null): string {
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

/** Cartão de resumo que também é atalho de filtro — clicar em "Falhas" filtra as falhas. */
function Cartao({ label, valor, accent, ativo, onClick }: { label: string; valor: number; accent?: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-lg bg-surface p-4 text-left shadow-sm ring-1 transition hover:ring-primary/50 ${ativo ? 'ring-2 ring-primary' : 'ring-line'}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted">{label}{ativo && <X size={12} />}</div>
      <div className="tabular mt-1 text-2xl font-semibold" style={{ color: accent || '#16233A' }}>{valor.toLocaleString('pt-BR')}</div>
    </button>
  );
}

function DisparosConteudo() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const q = sp.get('q') || '';
  const status = sp.get('status') || '';
  const tipoCanal = sp.get('tipo') || '';
  const channelAccountId = sp.get('canal') || '';
  const campanhaId = sp.get('campanha') || '';
  const periodo = sp.get('periodo') || '30d';
  const { de, ate } = intervalo(periodo, sp.get('de') || '', sp.get('ate') || '');

  const [busca, setBusca] = useState(q);
  const [cursores, setCursores] = useState<string[]>([]);
  const [lista, setLista] = useState<Lista | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [mensagem, setMensagem] = useState<{ titulo: string; texto: string } | null>(null);
  const [canais, setCanais] = useState<{ id: string; apelido: string; canal: string }[]>([]);
  const [campanhas, setCampanhas] = useState<{ id: string; nome: string }[]>([]);
  const req = useRef(0);

  /** Toda mudança de filtro vai para a URL (F5 e link compartilhável preservam a
   *  visão) e zera a pilha de cursores — cursor de um recorte não vale em outro. */
  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setCursores([]);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sp, pathname, router]);

  // A busca por nome é o filtro mais caro do backend; sem esperar a digitação
  // parar, cada tecla dispararia uma varredura.
  useEffect(() => {
    if (busca === q) return;
    const t = setTimeout(() => setParam({ q: busca || null }), 400);
    return () => clearTimeout(t);
  }, [busca, q, setParam]);

  const filtros = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tipoCanal) p.set('tipoCanal', tipoCanal);
    if (channelAccountId) p.set('channelAccountId', channelAccountId);
    if (campanhaId) p.set('campanhaId', campanhaId);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    return p.toString();
  }, [q, tipoCanal, channelAccountId, campanhaId, de, ate]);

  const cursor = cursores[cursores.length - 1];

  useEffect(() => {
    const id = ++req.current;
    setCarregando(true);
    const p = new URLSearchParams(filtros);
    if (status) p.set('status', status);
    p.set('pageSize', String(POR_PAGINA));
    if (cursor) p.set('cursor', cursor);
    // O COUNT é a parte cara e não muda ao virar de página: pede só na primeira.
    const pedirTotal = !cursor;
    if (pedirTotal) p.set('comTotal', '1');

    api<Lista>(`/disparos?${p.toString()}`).catch(() => null).then((r) => {
      if (id !== req.current) return; // resposta de uma busca já abandonada
      setLista(r);
      if (pedirTotal) setTotal(r?.total ?? null);
      setCarregando(false);
    });
  }, [filtros, status, cursor]);

  // O resumo ignora o filtro de status (os cartões contam todos), então não
  // precisa recarregar quando só o status muda — nem ao virar de página.
  useEffect(() => {
    api<Resumo>(`/disparos/resumo?${filtros}`).then(setResumo).catch(() => setResumo(null));
  }, [filtros]);

  useEffect(() => {
    api<{ id: string; apelido: string; canal: string }[]>('/canais').then(setCanais).catch(() => setCanais([]));
    api<{ id: string; nome: string }[]>('/campanhas').then(setCampanhas).catch(() => setCampanhas([]));
  }, []);

  function limparFiltros() {
    setBusca('');
    setCursores([]);
    router.replace(pathname, { scroll: false });
  }

  function alternarStatus(s: string) {
    setParam({ status: status === s ? null : s });
  }

  async function abrirMensagem(d: Row) {
    const titulo = d.cliente || 'Mensagem enviada';
    if (!d.conteudoTruncado) { setMensagem({ titulo, texto: d.conteudo || '' }); return; }
    setMensagem({ titulo, texto: (d.conteudo || '') + '…' });
    const full = await api<{ conteudo?: string | null }>(`/disparos/${d.id}`).catch(() => null);
    if (full) setMensagem({ titulo, texto: full.conteudo || '' });
  }

  async function exportarCsv() {
    setExportando(true);
    try {
      const p = new URLSearchParams(filtros);
      if (status) p.set('status', status);
      const res = await fetch(`${API_URL}/disparos/export.csv?${p.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `disparos-${iso(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  const rows = lista?.rows ?? [];
  const pagina = cursores.length + 1;
  const inicio = cursores.length * POR_PAGINA + 1;
  const fim = cursores.length * POR_PAGINA + rows.length;
  const filtrosAtivos = [q, status, tipoCanal, channelAccountId, campanhaId].filter(Boolean).length + (periodo === '30d' ? 0 : 1);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle title="Disparos" subtitle="Histórico de todas as mensagens enviadas aos seus clientes" />
        <button
          onClick={exportarCsv}
          disabled={exportando || !rows.length}
          title={`Baixa o filtro atual em CSV (até ${EXPORT_MAX.toLocaleString('pt-BR')} linhas)`}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-40"
        >
          {exportando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Exportar CSV
        </button>
      </div>

      {resumo && (
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Cartao label="Enviados" valor={resumo.enviados} accent="#0F6E56" ativo={status === 'SUCESSO'} onClick={() => alternarStatus('SUCESSO')} />
          <Cartao label="Entregues" valor={resumo.entregues} ativo={status === 'ENTREGUE'} onClick={() => alternarStatus('ENTREGUE')} />
          <Cartao label="Falhas" valor={resumo.falhas} accent={resumo.falhas > 0 ? '#EF4444' : undefined} ativo={status === 'FALHA'} onClick={() => alternarStatus('FALHA')} />
          <Cartao label="Na fila" valor={resumo.fila} accent="#F0A93B" ativo={status === 'FILA'} onClick={() => alternarStatus('FILA')} />
        </div>
      )}

      <div className="mb-4 rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setParam({ periodo: p.id === '30d' ? null : p.id, de: null, ate: null })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${periodo === p.id ? 'bg-primary text-white' : 'bg-canvas text-muted hover:bg-primary-tint hover:text-primary'}`}
            >
              {p.label}
            </button>
          ))}
          {periodo === 'custom' && <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">Personalizado</span>}
          <span className="ml-auto flex items-center gap-2 text-xs font-medium text-muted">
            <Filter size={14} /> Filtros {filtrosAtivos > 0 && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-primary">{filtrosAtivos}</span>}
            {filtrosAtivos > 0 && <button onClick={limparFiltros} className="flex items-center gap-1 rounded-md border border-danger/40 bg-danger-tint px-3 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-white"><X size={13} /> Limpar</button>}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <input placeholder="Cliente / telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary lg:col-span-2" />
          <select value={campanhaId} onChange={(e) => setParam({ campanha: e.target.value || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Campanha: todas</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          <select value={tipoCanal} onChange={(e) => setParam({ tipo: e.target.value || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Tipo: todos</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="SMS">SMS</option></select>
          <select value={channelAccountId} onChange={(e) => setParam({ canal: e.target.value || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Canal: todos</option>{canais.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}</select>
          <select value={status} onChange={(e) => setParam({ status: e.target.value || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Status: todos</option><option value="SUCESSO">Enviados (todos)</option><option value="ENVIADO">Enviado</option><option value="ENTREGUE">Entregue</option><option value="LIDO">Lido</option><option value="FALHA">Falha</option><option value="FILA">Na fila</option><option value="IGNORADO">Ignorado</option></select>
          <input type="date" title="De" value={de} onChange={(e) => setParam({ periodo: 'custom', de: e.target.value || null, ate: ate || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="date" title="Até" value={ate} onChange={(e) => setParam({ periodo: 'custom', de: de || null, ate: e.target.value || null })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className={`h-0.5 ${carregando ? 'animate-pulse bg-primary' : 'bg-transparent'}`} />
        <div className={`w-full overflow-x-auto transition-opacity ${carregando ? 'opacity-50' : ''}`}><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Canal</th>
              <th className="px-4 py-3 font-medium">Origem</th>
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
                  <td className="px-4 py-3 text-muted">
                    {d.campanha
                      ? <span>{d.campanha}</span>
                      : d.regua
                        ? <span>Cobrança automática<br /><span className="text-xs text-muted">régua: {d.regua}</span></span>
                        : <span className="text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {d.conteudo
                      ? <button onClick={() => abrirMensagem(d)} className="flex items-center gap-1 text-xs text-primary hover:underline"><MessageSquare size={13} /> ver mensagem</button>
                      : <span className="text-xs text-muted">—</span>}
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
            {rows.length === 0 && !carregando && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">
                Nenhum disparo encontrado{periodo !== 'tudo' && <> neste período. <button onClick={() => setParam({ periodo: 'tudo', de: null, ate: null })} className="text-primary hover:underline">Ver todo o histórico</button></>}
              </td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {rows.length > 0 && <>{inicio.toLocaleString('pt-BR')}–{fim.toLocaleString('pt-BR')}{total !== null && <> de {total.toLocaleString('pt-BR')}</>} · página {pagina}</>}
        </span>
        <div className="flex items-center gap-1">
          <button disabled={pagina === 1} onClick={() => setCursores([])} title="Primeira página" className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:bg-canvas disabled:opacity-30"><ChevronsLeft size={16} /></button>
          <button disabled={pagina === 1} onClick={() => setCursores((c) => c.slice(0, -1))} className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:bg-canvas disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button disabled={!lista?.nextCursor} onClick={() => lista?.nextCursor && setCursores((c) => [...c, lista.nextCursor!])} className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:bg-canvas disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>

      {mensagem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMensagem(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="font-medium text-ink">{mensagem.titulo}</h3>
              <button onClick={() => setMensagem(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{mensagem.texto}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DisparosPage() {
  return (
    <Suspense fallback={<PageTitle title="Disparos" subtitle="Histórico de todas as mensagens enviadas aos seus clientes" />}>
      <DisparosConteudo />
    </Suspense>
  );
}
