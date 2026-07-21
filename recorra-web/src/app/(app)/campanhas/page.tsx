'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Play, Pause, BarChart3, Pencil, Trash2, X, Megaphone, ExternalLink, Copy, Filter, Loader2, HelpCircle, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PreviewButton } from '@/components/MessagePreview';

interface Regua { id: string; nome: string; steps?: { canal: string }[] }
interface ModeloEmail { id: string; nome: string; assunto: string; corpo: string }
interface Etiqueta { nome: string }
interface Run { id: string; totalContatos: number; enviados: number; falhas: number; executadoEm: string }
interface Campaign {
  id: string; nome: string;
  tipoEnvio: 'REGUA' | 'MENSAGEM' | 'LEMBRETE';
  ruleId?: string; rule?: { id: string; nome: string };
  mensagem?: string; emailAssunto?: string; canal?: string; channelAccountId?: string; templateNome?: string; templateParams?: string[]; escopoFatura?: 'TODAS' | 'PROXIMA'; delaySegundos?: number;
  filtroTodos: boolean; filtroEtiqueta?: string; filtroValorMin?: number; filtroValorMax?: number; filtroFaixa?: string; filtroStatus?: string; filtroDiasAtraso?: number; filtroPlano?: string; filtroCidade?: string;
  incluirIds?: string[]; excluirIds?: string[];
  publicoDinamico: boolean;
  agendamento: 'UMA_VEZ' | 'MENSAL' | 'SEMPRE_ATIVA'; diaDoMes?: number;
  status: string; runs?: Run[];
  entrega?: { total: number; enviados: number; fila: number; falha: number } | null;
}

const CANAL_LABEL: Record<string, string> = {
  WHATSAPP_CLOUD: 'WhatsApp (Cloud oficial)',
  EMAIL: 'E-mail',
  SMS: 'SMS',
  HTTP_GENERIC: 'API genérica (HTTP)',
  NX_SYSTEMS: 'NX Systems',
  // Legados: não é mais possível criar, mas ainda podem existir no banco.
  WHATSAPP_EVOLUTION: 'WhatsApp (Evolution)',
  WHATSAPP_UAZAPI: 'WhatsApp (uazapi)',
};
/** WhatsApp só envia por template aprovado; texto livre sobra para SMS e e-mail. */
const CANAIS_WHATSAPP = ['WHATSAPP_CLOUD', 'NX_SYSTEMS', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI'];
const ehWhatsApp = (canal?: string) => !!canal && CANAIS_WHATSAPP.includes(canal);
interface ContaCanal { id: string; canal: string; apelido?: string; status: string; oficial?: boolean; nxType?: string }
/** Tipos de canal distintos entre as contas configuradas (não desconectadas). */
function canaisConfigurados(contas: ContaCanal[]): { v: string; l: string }[] {
  const vistos = new Set<string>();
  const out: { v: string; l: string }[] = [];
  for (const c of contas) {
    if (c.status === 'DESCONECTADO' || vistos.has(c.canal)) continue;
    vistos.add(c.canal);
    out.push({ v: c.canal, l: CANAL_LABEL[c.canal] ?? c.canal });
  }
  return out;
}

/** "?" com explicação ao passar o mouse. Reaproveita o padrão da tela de disparos. */
function Ajuda({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" tabIndex={-1} className="flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-primary"><HelpCircle size={13} /></button>
      <span className="pointer-events-none absolute left-0 top-6 z-30 hidden w-64 whitespace-normal rounded-lg border border-line bg-surface p-2.5 text-xs font-normal leading-relaxed text-ink shadow-lg group-hover:block">{children}</span>
    </span>
  );
}

/** Tipo de envio amigável, para deixar claro se a conta é E-mail, WhatsApp ou SMS. */
function tipoDeEnvioLabel(canal: string): string {
  if (canal.startsWith('WHATSAPP')) return 'WhatsApp';
  if (canal === 'EMAIL') return 'E-mail';
  if (canal === 'SMS') return 'SMS';
  return CANAL_LABEL[canal] ?? canal; // NX Systems, API genérica...
}

/** Conexões (por conta) disponíveis para envio. */
interface Conexao { id: string; canal: string; whats: boolean; label: string }
function conexoesDisponiveis(contas: ContaCanal[]): Conexao[] {
  return contas
    .filter((c) => c.status !== 'DESCONECTADO')
    .map((c) => {
      const apelido = c.apelido?.trim();
      // Sempre começa pelo tipo (E-mail / WhatsApp / SMS) e só então o apelido da conta.
      return {
        id: c.id,
        canal: c.canal,
        whats: ehWhatsApp(c.canal),
        label: apelido ? `${tipoDeEnvioLabel(c.canal)} · ${apelido}` : tipoDeEnvioLabel(c.canal),
      };
    });
}

interface Template { id: string; nome: string; corpo: string; status: string; idioma?: string }
/** Extrai as variáveis do corpo do template, na ordem (ex.: {{1}} {{2}} ou {{nome}}). */
function templateVars(corpo: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo || ''))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
const MAP_OPCOES = [
  { v: '{{nome}}', l: 'Nome do cliente' },
  { v: '{{valor}}', l: 'Valor da fatura' },
  { v: '{{vencimento}}', l: 'Vencimento' },
  { v: '{{pix}}', l: 'Pix copia e cola' },
  { v: '{{link}}', l: 'Link de pagamento' },
  { v: '{{documento}}', l: 'CPF/CNPJ' },
  { v: '__FIXO__', l: 'Texto fixo' },
];
const statusColor: Record<string, string> = {
  RASCUNHO: 'bg-canvas text-muted', ATIVA: 'bg-primary-tint text-primary',
  PAUSADA: 'bg-warning-tint text-[#854F0B]', CONCLUIDA: 'bg-canvas text-muted',
};
const statusLabel: Record<string, string> = { RASCUNHO: 'Rascunho', ATIVA: 'Ativa', PAUSADA: 'Pausada', CONCLUIDA: 'Disparada' };
const agendaLabel = (c: Campaign) => c.agendamento === 'UMA_VEZ' ? 'Uma vez' : c.agendamento === 'MENSAL' ? `Todo mês (dia ${c.diaDoMes || 1})` : 'Sempre ativa';
/** Campanha de envio único já disparada não dispara de novo — o caminho é duplicar e disparar a cópia. */
const jaDisparada = (c: Campaign) => c.agendamento === 'UMA_VEZ' && !!c.entrega;
const dataHora = (s?: string) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const SITUACAO_LABEL: Record<string, string> = {
  VENCIDA: 'com fatura vencida',
  PENDENTE: 'com fatura a vencer',
  ABERTO: 'com fatura em aberto',
  EM_DIA: 'em dia',
};

const publicoLabel = (c: Campaign) => {
  if (c.filtroTodos) return 'Todos os contatos';
  const p: string[] = [];
  if (c.filtroEtiqueta) p.push(`etiqueta: ${c.filtroEtiqueta}`);
  if (c.filtroFaixa) p.push(`risco: ${c.filtroFaixa}`);
  if (c.filtroStatus) p.push(`situação: ${SITUACAO_LABEL[c.filtroStatus] ?? c.filtroStatus}`);
  if (c.filtroValorMin || c.filtroValorMax) p.push(`valor ${c.filtroValorMin || 0}–${c.filtroValorMax || '∞'}`);
  return p.length ? p.join(' · ') : 'Sem filtro';
};

export default function CampanhasPage() {
  const [lista, setLista] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; edit?: Campaign | null }>({ open: false });
  const [relatorio, setRelatorio] = useState<Campaign | null>(null);
  const [confirmarDisparo, setConfirmarDisparo] = useState<Campaign | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<Campaign | null>(null);
  const [msg, setMsg] = useState('');
  const emptyFiltros = { q: '', status: '', tipoEnvio: '', ruleId: '', agendamento: '', etiqueta: '', canal: '', de: '', ate: '' };
  const [filtros, setFiltros] = useState(emptyFiltros);
  const [reguas, setReguas] = useState<{ id: string; nome: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ nome: string }[]>([]);
  const [canais, setCanais] = useState<ContaCanal[]>([]);
  const canaisFiltro = canaisConfigurados(canais);
  const setF = (k: string, v: string) => setFiltros((s) => ({ ...s, [k]: v }));

  const [automatica, setAutomatica] = useState<{ id: string; status: string } | null>(null);
  useEffect(() => { api<{ id: string; status: string }>('/campanhas/automatica').then(setAutomatica).catch(() => setAutomatica(null)); }, []);
  async function toggleAutomatica() {
    if (!automatica) return;
    const novo = automatica.status === 'ATIVA' ? 'PAUSADA' : 'ATIVA';
    setAutomatica({ ...automatica, status: novo }); // otimista
    await api('/campanhas/automatica/status', { method: 'POST', body: { status: novo } }).catch(() => setAutomatica(automatica));
  }

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v));
    const r = await api<Campaign[]>(`/campanhas?${params.toString()}`).catch(() => null);
    if (r) setLista(r);
    if (!silencioso) setLoading(false);
  }, [filtros]);
  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto houver mensagem na fila, o worker ainda está enviando: recarrega sozinho
  // até zerar, para o usuário ver o progresso sem apertar F5.
  const temFila = lista.some((c) => (c.entrega?.fila ?? 0) > 0);
  useEffect(() => {
    if (!temFila) return;
    const t = setInterval(() => carregar(true), 4000);
    return () => clearInterval(t);
  }, [temFila, carregar]);
  useEffect(() => { api<{ id: string; nome: string }[]>('/reguas').then(setReguas).catch(() => setReguas([])); api<{ nome: string }[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([])); api<ContaCanal[]>('/canais').then(setCanais).catch(() => setCanais([])); }, []);
  const filtrosAtivos = Object.values(filtros).filter(Boolean).length;

  async function executar(c: Campaign) {
    setMsg(`Disparando "${c.nome}"...`);
    const r = await api<{ total: number; enviados: number; falhas: number }>(`/campanhas/${c.id}/executar`, { method: 'POST' }).catch((e) => { setMsg(e.message); return null; });
    if (r) setMsg(`✓ ${c.nome}: ${r.enviados} de ${r.total} colocados na fila de envio. O envio real acontece em seguida — acompanhe no relatório.`);
    carregar();
  }
  async function toggleStatus(c: Campaign) {
    const novo = c.status === 'PAUSADA' ? 'ATIVA' : 'PAUSADA';
    await api(`/campanhas/${c.id}/status`, { method: 'POST', body: { status: novo } }).catch(() => {});
    carregar();
  }
  async function duplicar(c: Campaign) {
    await api(`/campanhas/${c.id}/duplicar`, { method: 'POST' }).catch((e) => setMsg(e.message));
    carregar();
  }

  async function excluir(c: Campaign) {
    await api(`/campanhas/${c.id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Campanhas" subtitle="Único lugar para disparar: monte o público, escolha régua ou mensagem e acompanhe o relatório" />
        <button onClick={() => setModal({ open: true, edit: null })} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Nova campanha</button>
      </div>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
        <Radio size={16} className={`mt-0.5 shrink-0 ${automatica?.status === 'PAUSADA' ? 'text-muted' : 'text-primary'}`} />
        <div className="flex-1 text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-ink">Cobrança automática</b>
            {automatica && (automatica.status === 'ATIVA'
              ? <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">Ligada</span>
              : <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-[#854F0B]">Pausada</span>)}
            {automatica && (
              <button onClick={toggleAutomatica} className="ml-auto rounded border border-line px-3 py-1 text-xs font-medium hover:bg-surface">
                {automatica.status === 'ATIVA' ? 'Pausar cobrança automática' : 'Religar cobrança automática'}
              </button>
            )}
          </div>
          <p className="mt-1">
            Roda todo dia por trás: pega quem está inadimplente e aplica a régua da faixa de risco de cada cliente — sem você precisar disparar. {automatica?.status === 'PAUSADA' && <b className="text-[#854F0B]">Agora está pausada: ninguém será cobrado automaticamente até religar.</b>} As campanhas abaixo são os envios que <b className="text-ink">você</b> monta e dispara. A régua define <b className="text-ink">como</b> comunicar; a campanha define <b className="text-ink">quem</b> e <b className="text-ink">quando</b>.
          </p>
        </div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-line">
        {[['', 'Todas'], ['UMA_VEZ', 'Uma vez'], ['MENSAL', 'Todo mês'], ['SEMPRE_ATIVA', 'Sempre ativa']].map(([v, l]) => (
          <button key={l} onClick={() => setF('agendamento', v)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${filtros.agendamento === v ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>

      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}
      {temFila && <p className="mb-3 flex items-center gap-2 text-xs text-muted"><Loader2 size={13} className="animate-spin text-primary" /> Enviando... esta tela atualiza sozinha conforme as mensagens saem.</p>}

      <div className="mb-4 rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Filter size={14} /> Filtros {filtrosAtivos > 0 && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-primary">{filtrosAtivos}</span>}{filtrosAtivos > 0 && <button onClick={() => setFiltros(emptyFiltros)} className="ml-auto flex items-center gap-1 rounded-md border border-danger/40 bg-danger-tint px-3 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-white"><X size={13} /> Limpar filtros</button>}</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <input placeholder="Nome" value={filtros.q} onChange={(e) => setF('q', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary lg:col-span-2" />
          <select value={filtros.status} onChange={(e) => setF('status', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Status: todos</option><option value="RASCUNHO">Rascunho</option><option value="ATIVA">Ativa</option><option value="PAUSADA">Pausada</option><option value="CONCLUIDA">Disparada</option></select>
          <select value={filtros.tipoEnvio} onChange={(e) => setF('tipoEnvio', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Envio: todos</option><option value="LEMBRETE">Lembrete</option><option value="MENSAGEM">Mensagem</option><option value="REGUA">Régua</option></select>
          <select value={filtros.ruleId} onChange={(e) => setF('ruleId', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Régua: todas</option>{reguas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
          <select value={filtros.etiqueta} onChange={(e) => setF('etiqueta', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Etiqueta: todas</option>{etiquetas.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}</select>
          <select value={filtros.canal} onChange={(e) => setF('canal', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Canal: todos</option>{canaisFiltro.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          <input type="date" title="Criada de" value={filtros.de} onChange={(e) => setF('de', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="date" title="Criada até" value={filtros.ate} onChange={(e) => setF('ate', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">Público</th><th className="px-4 py-3 font-medium">Envio</th><th className="px-4 py-3 font-medium">Agendamento</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Último envio</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const e = c.entrega;
              return (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{c.nome}</td>
                  <td className="px-4 py-3 text-muted">{publicoLabel(c)}</td>
                  <td className="px-4 py-3 text-muted">{c.tipoEnvio === 'REGUA' ? `Régua: ${c.rule?.nome || '—'}` : c.tipoEnvio === 'LEMBRETE' ? 'Lembrete de cobrança' : 'Mensagem única'}</td>
                  <td className="px-4 py-3 text-muted">{agendaLabel(c)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[c.status] || 'bg-canvas text-muted'}`}>{statusLabel[c.status] || c.status}</span></td>
                  <td className="px-4 py-3">
                    {e ? (
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="rounded-full bg-success-tint px-2 py-0.5 text-[#0F6E56]">✓ {e.enviados} enviados</span>
                        {e.fila > 0 && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[#854F0B]">⏳ {e.fila} na fila</span>}
                        {e.falha > 0 && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[#A32D2D]">✕ {e.falha} falha</span>}
                      </div>
                    ) : <span className="text-xs text-muted">— não disparada</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!jaDisparada(c) && <button onClick={() => setConfirmarDisparo(c)} title="Disparar agora" className="rounded p-1.5 text-muted hover:bg-primary-tint hover:text-primary"><Play size={15} /></button>}
                      <button onClick={() => setRelatorio(c)} title="Relatório" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><BarChart3 size={15} /></button>
                      {c.agendamento !== 'UMA_VEZ' && <button onClick={() => toggleStatus(c)} title={c.status === 'PAUSADA' ? 'Ativar' : 'Pausar'} className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary">{c.status === 'PAUSADA' ? <Play size={15} /> : <Pause size={15} />}</button>}
                      <button onClick={() => duplicar(c)} title={jaDisparada(c) ? 'Envio único já disparado — duplique para enviar de novo' : 'Duplicar'} className={`rounded p-1.5 hover:bg-canvas hover:text-primary ${jaDisparada(c) ? 'text-primary' : 'text-muted'}`}><Copy size={15} /></button>
                      <button onClick={() => setModal({ open: true, edit: c })} title="Editar" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><Pencil size={15} /></button>
                      <button onClick={() => setConfirmarExclusao(c)} title="Excluir" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && lista.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted"><Megaphone size={28} className="mx-auto mb-2 opacity-40" />Nenhuma campanha ainda. Crie a primeira em "Nova campanha".</td></tr>}
          </tbody>
        </table></div>
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {modal.open && <CampanhaModal edit={modal.edit} onClose={() => setModal({ open: false })} onSaved={() => { setModal({ open: false }); carregar(); }} />}
      {relatorio && <RelatorioModal campanha={relatorio} onClose={() => setRelatorio(null)} />}
      {confirmarDisparo && (
        <RevisaoDisparoModal
          campanha={confirmarDisparo}
          onConfirm={() => { const c = confirmarDisparo; setConfirmarDisparo(null); executar(c); }}
          onClose={() => setConfirmarDisparo(null)}
        />
      )}
      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir campanha"
          mensagem={<>Excluir a campanha <b className="text-ink">{confirmarExclusao.nome}</b>? O histórico de envios dela também é removido.</>}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { const c = confirmarExclusao; setConfirmarExclusao(null); excluir(c); }}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </div>
  );
}

/** Escolha do template aprovado + mapeamento das variáveis. Usado por Mensagem única e Lembrete. */
function BlocoTemplate({ templates, valor, onChange, params, setParam }: {
  templates: Template[]; valor: string; onChange: (v: string) => void;
  params: string[]; setParam: (i: number, v: string) => void;
}) {
  const aprovados = templates.filter((t) => t.status === 'APROVADO');
  const sel = templates.find((t) => t.nome === valor);
  const vars = sel ? templateVars(sel.corpo) : [];
  return (
    <div className="space-y-2">
      <div className="rounded bg-primary-tint px-3 py-2 text-xs text-primary">O WhatsApp entrega cobrança <b>só por template aprovado</b>. Escolha um e ligue cada variável a um dado do cliente.</div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Template aprovado *</span>
        <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">Selecione um template...</option>
          {aprovados.map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
        </select>
      </label>
      {aprovados.length === 0 && <div className="text-xs text-muted">Nenhum template aprovado. Cadastre/sincronize em <Link href="/canais" className="text-primary hover:underline">Canais</Link>.</div>}
      {sel && <div className="rounded bg-canvas p-2 text-xs text-muted"><b className="text-ink">Prévia:</b> {sel.corpo}</div>}
      {sel && vars.length > 0 && (
        <div className="space-y-2 rounded border border-line p-2">
          <span className="block text-xs font-semibold text-muted">Preencher as variáveis do template</span>
          {vars.map((vName, i) => {
            const val = params[i] ?? '';
            const isFixo = !val.startsWith('{{');
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 font-mono text-xs text-muted">{`{{${vName}}}`}</span>
                <select value={isFixo ? '__FIXO__' : val} onChange={(e) => setParam(i, e.target.value === '__FIXO__' ? '' : e.target.value)} className="rounded border border-line px-2 py-1 text-sm outline-none focus:border-primary">
                  {MAP_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                {isFixo && <input value={val} onChange={(e) => setParam(i, e.target.value)} placeholder="texto fixo" className="flex-1 rounded border border-line px-2 py-1 text-sm outline-none focus:border-primary" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Bloco de e-mail: assunto + corpo, com atalho para carregar um modelo salvo.
 * Escolher um modelo COPIA o texto para a campanha — mexer no modelo depois não
 * altera campanhas já criadas, e editar aqui não altera o modelo.
 */
function BlocoEmail({ assunto, corpo, onAssunto, onCorpo }: {
  assunto: string; corpo: string; onAssunto: (v: string) => void; onCorpo: (v: string) => void;
}) {
  const [modelos, setModelos] = useState<ModeloEmail[]>([]);
  useEffect(() => { api<ModeloEmail[]>('/modelos-email').then(setModelos).catch(() => setModelos([])); }, []);

  function usarModelo(id: string) {
    const m = modelos.find((x) => x.id === id);
    if (!m) return;
    onAssunto(m.assunto);
    onCorpo(m.corpo);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-canvas px-3 py-2">
        <span className="text-xs text-muted">Começar de um modelo:</span>
        <select value="" onChange={(e) => usarModelo(e.target.value)} className="rounded border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary">
          <option value="">{modelos.length ? 'Escolher modelo...' : 'Nenhum modelo salvo'}</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <Link href="/modelos-email" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink size={12} /> Gerenciar modelos</Link>
      </div>

      <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Assunto *</span>
        <input value={assunto} onChange={(e) => onAssunto(e.target.value)} placeholder="Ex.: {{nome}}, sua fatura vence em {{vencimento}}" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
      </label>

      <label className="block text-sm"><span className="mb-1 flex items-center gap-2 text-xs text-muted">Mensagem <PreviewButton canal="EMAIL" texto={corpo} assunto={assunto} /></span>
        <textarea value={corpo} onChange={(e) => onCorpo(e.target.value)} rows={7} placeholder={'Olá {{nome}},\n\nSua fatura de {{valor}} vence em {{vencimento}}.\n\n{{link}}'} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
      </label>

      <div className="rounded bg-canvas p-2 text-xs text-muted">
        <b className="text-ink">Variáveis:</b>{' '}
        {['{{nome}}', '{{valor}}', '{{vencimento}}', '{{link}}', '{{boleto}}', '{{pix}}'].map((v) => (
          <button key={v} type="button" onClick={() => onCorpo(`${corpo}${corpo && !corpo.endsWith('\n') ? ' ' : ''}${v}`)} className="mr-1 rounded bg-surface px-1.5 py-0.5 font-mono text-primary hover:bg-primary-tint">{v}</button>
        ))}
        <span className="mt-1 block">Valem no assunto também. O layout (logo, cores, botão, rodapé) é aplicado no envio — configure em Modelos de e-mail.</span>
      </div>
    </div>
  );
}

function CampanhaModal({ edit, onClose, onSaved }: { edit?: Campaign | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome: edit?.nome || '',
    tipoEnvio: edit?.tipoEnvio || 'MENSAGEM',
    ruleId: edit?.ruleId || '',
    mensagem: edit?.mensagem || '',
    emailAssunto: edit?.emailAssunto || '',
    canal: edit?.canal || '',
    channelAccountId: edit?.channelAccountId || '',
    templateNome: edit?.templateNome || '',
    escopoFatura: edit?.escopoFatura || 'TODAS',
    delaySegundos: edit?.delaySegundos != null ? String(edit.delaySegundos) : '5',
    filtroTodos: edit?.filtroTodos ?? true,
    filtroEtiqueta: edit?.filtroEtiqueta || '',
    filtroValorMin: edit?.filtroValorMin ? String(edit.filtroValorMin) : '',
    filtroValorMax: edit?.filtroValorMax ? String(edit.filtroValorMax) : '',
    filtroFaixa: edit?.filtroFaixa || '',
    filtroStatus: edit?.filtroStatus || '',
    filtroDiasAtraso: edit?.filtroDiasAtraso ? String(edit.filtroDiasAtraso) : '',
    filtroPlano: edit?.filtroPlano || '',
    filtroCidade: edit?.filtroCidade || '',
    publicoDinamico: edit?.publicoDinamico ?? true,
    agendamento: edit?.agendamento || 'UMA_VEZ',
    diaDoMes: edit?.diaDoMes ? String(edit.diaDoMes) : '1',
  });
  const [reguas, setReguas] = useState<Regua[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [canais, setCanais] = useState<ContaCanal[]>([]);
  const conexoes = conexoesDisponiveis(canais);
  const conexaoSel = conexoes.find((c) => c.id === f.channelAccountId);
  const isWhats = !!conexaoSel?.whats;
  const isEmail = conexaoSel?.canal === 'EMAIL';
  const [templates, setTemplates] = useState<Template[]>([]);
  const templateSel = templates.find((t) => t.nome === f.templateNome);
  const varsTemplate = templateSel ? templateVars(templateSel.corpo) : [];
  const [templateParams, setTemplateParams] = useState<string[]>(edit?.templateParams || []);
  const setParam = (i: number, v: string) => setTemplateParams((p) => { const n = [...p]; n[i] = v; return n; });
  const [publico, setPublico] = useState<PublicoPreview | null>(null);
  const [incluir, setIncluir] = useState<string[]>(edit?.incluirIds || []);
  const [excluir, setExcluir] = useState<string[]>(edit?.excluirIds || []);
  const [verContatos, setVerContatos] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const [segmentos, setSegmentos] = useState<{ id: string; nome: string; filtros: Record<string, unknown> }[]>([]);
  const [salvandoSeg, setSalvandoSeg] = useState(false);
  const [nomeSeg, setNomeSeg] = useState('');
  const carregarSegmentos = useCallback(() => { api<{ id: string; nome: string; filtros: Record<string, unknown> }[]>('/campanhas/segmentos').then(setSegmentos).catch(() => setSegmentos([])); }, []);
  useEffect(() => { carregarSegmentos(); }, [carregarSegmentos]);

  /** Filtros atuais no formato do segmento/prévia (números onde couber). */
  function filtrosAtuais() {
    return {
      filtroTodos: f.filtroTodos,
      filtroEtiqueta: f.filtroEtiqueta || null, filtroFaixa: f.filtroFaixa || null, filtroStatus: f.filtroStatus || null,
      filtroValorMin: f.filtroValorMin ? Number(f.filtroValorMin) : null,
      filtroValorMax: f.filtroValorMax ? Number(f.filtroValorMax) : null,
      filtroDiasAtraso: f.filtroDiasAtraso ? Number(f.filtroDiasAtraso) : null,
      filtroPlano: f.filtroPlano || null, filtroCidade: f.filtroCidade || null,
    };
  }
  function aplicarSegmento(s: { filtros: Record<string, unknown> }) {
    const fl = s.filtros || {};
    const txt = (k: string) => (fl[k] == null ? '' : String(fl[k]));
    setF((cur) => ({ ...cur, filtroTodos: false, filtroEtiqueta: txt('filtroEtiqueta'), filtroFaixa: txt('filtroFaixa'), filtroStatus: txt('filtroStatus'), filtroValorMin: txt('filtroValorMin'), filtroValorMax: txt('filtroValorMax'), filtroDiasAtraso: txt('filtroDiasAtraso'), filtroPlano: txt('filtroPlano'), filtroCidade: txt('filtroCidade') }));
  }
  async function salvarSegmento() {
    const nome = nomeSeg.trim();
    if (!nome) return;
    await api('/campanhas/segmentos', { method: 'POST', body: { nome, filtros: filtrosAtuais() } }).catch(() => {});
    setSalvandoSeg(false); setNomeSeg('');
    carregarSegmentos();
  }

  useEffect(() => {
    api<Regua[]>('/reguas').then(setReguas).catch(() => setReguas([]));
    api<Etiqueta[]>('/clientes/etiquetas').then(setEtiquetas).catch(() => setEtiquetas([]));
    api<ContaCanal[]>('/canais').then(setCanais).catch(() => setCanais([]));
    api<Template[]>('/config/templates').then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Seleciona a primeira conexão quando ainda não há uma escolhida (define id + tipo de canal).
  useEffect(() => {
    if (!f.channelAccountId && conexoes.length) {
      setF((s) => ({ ...s, channelAccountId: conexoes[0].id, canal: conexoes[0].canal }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canais]);

  // Ajusta o nº de parâmetros ao template escolhido (default: nome).
  useEffect(() => {
    setTemplateParams((prev) => varsTemplate.map((_, i) => prev[i] ?? '{{nome}}'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.templateNome, templates.length]);

  useEffect(() => {
    const t = setTimeout(() => {
      api<PublicoPreview>('/campanhas/participantes', { method: 'POST', body: {
        filtroTodos: f.filtroTodos, filtroEtiqueta: f.filtroEtiqueta || undefined,
        filtroValorMin: f.filtroValorMin ? Number(f.filtroValorMin) : undefined,
        filtroValorMax: f.filtroValorMax ? Number(f.filtroValorMax) : undefined,
        filtroFaixa: f.filtroFaixa || undefined,
        filtroStatus: f.filtroStatus || undefined,
        filtroDiasAtraso: f.filtroDiasAtraso ? Number(f.filtroDiasAtraso) : undefined,
        filtroPlano: f.filtroPlano || undefined, filtroCidade: f.filtroCidade || undefined,
        tipoEnvio: f.tipoEnvio, canal: f.canal || undefined,
        // Na Régua, os canais reais são os dos passos (para o opt-out/alcance da prévia bater com o envio).
        canais: f.tipoEnvio === 'REGUA' ? [...new Set((reguas.find((r) => r.id === f.ruleId)?.steps ?? []).map((s) => s.canal))] : undefined,
        incluirIds: incluir, excluirIds: excluir,
      } }).then(setPublico).catch(() => setPublico(null));
    }, 300);
    return () => clearTimeout(t);
  }, [f.filtroTodos, f.filtroEtiqueta, f.filtroValorMin, f.filtroValorMax, f.filtroFaixa, f.filtroStatus, f.filtroDiasAtraso, f.filtroPlano, f.filtroCidade, f.tipoEnvio, f.canal, f.ruleId, reguas, incluir, excluir]);

  const comTemplate = (f.tipoEnvio === 'MENSAGEM' || f.tipoEnvio === 'LEMBRETE') && isWhats;

  async function salvar() {
    if (comTemplate && !f.templateNome) return setMsg('Escolha um template aprovado — o WhatsApp não entrega texto livre.');
    if (isEmail && f.tipoEnvio !== 'REGUA' && !f.emailAssunto.trim()) return setMsg('Escreva o assunto do e-mail.');
    setSaving(true); setMsg('');
    const body = {
      nome: f.nome, tipoEnvio: f.tipoEnvio,
      ruleId: f.tipoEnvio === 'REGUA' ? f.ruleId : null,
      mensagem: !isWhats && (f.tipoEnvio === 'MENSAGEM' || f.tipoEnvio === 'LEMBRETE') ? f.mensagem : null,
      emailAssunto: isEmail ? f.emailAssunto : null,
      canal: f.canal,
      channelAccountId: f.channelAccountId || null,
      // WhatsApp vai por template; SMS/e-mail vão por texto livre.
      templateNome: comTemplate ? (f.templateNome || null) : null,
      templateParams: comTemplate && f.templateNome ? templateParams : [],
      escopoFatura: f.escopoFatura,
      delaySegundos: Number(f.delaySegundos) || 0,
      filtroTodos: f.filtroTodos,
      filtroEtiqueta: f.filtroEtiqueta || null,
      filtroValorMin: f.filtroValorMin ? Number(f.filtroValorMin) : null,
      filtroValorMax: f.filtroValorMax ? Number(f.filtroValorMax) : null,
      filtroFaixa: f.filtroFaixa || null,
      filtroStatus: f.filtroStatus || null,
      filtroDiasAtraso: f.filtroDiasAtraso ? Number(f.filtroDiasAtraso) : null,
      filtroPlano: f.filtroPlano || null,
      filtroCidade: f.filtroCidade || null,
      incluirIds: incluir,
      excluirIds: excluir,
      publicoDinamico: f.publicoDinamico,
      agendamento: f.agendamento,
      diaDoMes: f.agendamento === 'MENSAL' ? Number(f.diaDoMes) : null,
    };
    try {
      if (edit) await api(`/campanhas/${edit.id}`, { method: 'PUT', body });
      else await api('/campanhas', { method: 'POST', body });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{edit ? 'Editar campanha' : 'Nova campanha'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <label className="mb-4 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da campanha *</span><input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Aviso de vencimento mensal" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>

        <div className="mb-4">
          <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
            O que enviar
            <Ajuda>
              <b>Lembrete de cobrança</b> e <b>Mensagem única</b> só diferem quando o cliente tem mais de uma fatura em aberto:<br /><br />
              <b>Lembrete:</b> uma mensagem para cada fatura em aberto, com o Pix/boleto de cada uma. Só vai para quem tem dívida.<br /><br />
              <b>Mensagem única:</b> uma única mensagem por cliente, para todo mundo do público — mesmo quem não deve nada.<br /><br />
              <b>Régua:</b> dispara um fluxo com vários passos ao longo do tempo.
            </Ajuda>
          </span>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <button onClick={() => set('tipoEnvio', 'LEMBRETE')} className={`rounded border p-3 text-left text-sm ${f.tipoEnvio === 'LEMBRETE' ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}><b className="text-ink">Lembrete de cobrança</b><div className="text-xs text-muted">Uma mensagem por fatura em aberto, com Pix/boleto. Só para quem deve.</div></button>
            <button onClick={() => set('tipoEnvio', 'MENSAGEM')} className={`rounded border p-3 text-left text-sm ${f.tipoEnvio === 'MENSAGEM' ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}><b className="text-ink">Mensagem única</b><div className="text-xs text-muted">Uma mensagem por cliente, para todo o público (mesmo sem dívida).</div></button>
            <button onClick={() => set('tipoEnvio', 'REGUA')} className={`rounded border p-3 text-left text-sm ${f.tipoEnvio === 'REGUA' ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}><b className="text-ink">Régua (fluxo)</b><div className="text-xs text-muted">Aciona uma régua com passos.</div></button>
          </div>
          {f.tipoEnvio === 'LEMBRETE' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted">Método de envio:</span>
                <select value={f.channelAccountId} onChange={(e) => { const c = conexoes.find((x) => x.id === e.target.value); setF((s) => ({ ...s, channelAccountId: e.target.value, canal: c?.canal || '' })); }} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">{conexoes.length === 0 && <option value="">Nenhum canal conectado</option>}{conexoes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </div>
              {isWhats ? (
                <BlocoTemplate templates={templates} valor={f.templateNome} onChange={(v) => set('templateNome', v)} params={templateParams} setParam={setParam} />
              ) : isEmail ? (
                <BlocoEmail assunto={f.emailAssunto} corpo={f.mensagem} onAssunto={(v) => set('emailAssunto', v)} onCorpo={(v) => set('mensagem', v)} />
              ) : (
                <>
                  <textarea value={f.mensagem} onChange={(e) => set('mensagem', e.target.value)} rows={4} placeholder={"Olá {{nome}}, sua fatura de {{valor}} vence em {{vencimento}}.\nPix copia e cola:\n{{pix}}\n\nOu acesse: {{link}}"} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                  <div className="rounded bg-canvas p-2 text-xs text-muted">
                    <b className="text-ink">Variáveis disponíveis:</b>{' '}
                    {['{{nome}}', '{{valor}}', '{{vencimento}}', '{{pix}}', '{{boleto}}', '{{link}}', '{{documento}}'].map((v) => (
                      <button key={v} type="button" onClick={() => set('mensagem', (f.mensagem || '') + ' ' + v)} className="mr-1 rounded bg-surface px-1.5 py-0.5 font-mono text-primary hover:bg-primary-tint">{v}</button>
                    ))}
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex items-center gap-1 text-xs text-muted">
                  Quando o cliente tem várias faturas em aberto:
                  <Ajuda>
                    <b>Uma mensagem por fatura:</b> se o cliente deve 3 faturas, ele recebe 3 mensagens, uma com o Pix/boleto de cada uma.<br /><br />
                    <b>Só a mais próxima do vencimento:</b> manda uma única mensagem, com a fatura que vence primeiro. Bom para não encher o cliente de mensagens.
                  </Ajuda>
                </span>
                <select value={f.escopoFatura} onChange={(e) => set('escopoFatura', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="TODAS">Uma mensagem por fatura</option>
                  <option value="PROXIMA">Só a mais próxima do vencimento</option>
                </select>
              </div>
            </div>
          ) : f.tipoEnvio === 'MENSAGEM' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted">Método de envio:</span>
                <select value={f.channelAccountId} onChange={(e) => { const c = conexoes.find((x) => x.id === e.target.value); setF((s) => ({ ...s, channelAccountId: e.target.value, canal: c?.canal || '' })); }} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">{conexoes.length === 0 && <option value="">Nenhum canal conectado</option>}{conexoes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </div>

              {isWhats ? (
                <BlocoTemplate templates={templates} valor={f.templateNome} onChange={(v) => set('templateNome', v)} params={templateParams} setParam={setParam} />
              ) : isEmail ? (
                <BlocoEmail assunto={f.emailAssunto} corpo={f.mensagem} onAssunto={(v) => set('emailAssunto', v)} onCorpo={(v) => set('mensagem', v)} />
              ) : (
                <>
                  <textarea value={f.mensagem} onChange={(e) => set('mensagem', e.target.value)} rows={4} placeholder="Olá {{nome}}, tudo bem?" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                  <div className="rounded bg-canvas p-2 text-xs text-muted">
                    <b className="text-ink">Variáveis:</b>{' '}
                    {['{{nome}}', '{{valor}}', '{{vencimento}}', '{{pix}}', '{{boleto}}', '{{link}}'].map((v) => (
                      <button key={v} type="button" onClick={() => set('mensagem', (f.mensagem || '') + ' ' + v)} className="mr-1 rounded bg-surface px-1.5 py-0.5 font-mono text-primary hover:bg-primary-tint">{v}</button>
                    ))}
                    <span className="ml-1">— as de fatura puxam a cobrança em aberto do cliente.</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select value={f.ruleId} onChange={(e) => set('ruleId', e.target.value)} className="flex-1 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="">Selecione a régua...</option>
                {reguas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
              <Link href="/reguas" className="flex items-center gap-1 rounded border border-line px-3 py-2 text-sm text-primary hover:bg-canvas"><ExternalLink size={14} /> Criar régua</Link>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Para quem (público)</span>
            {publico && <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary">{publico.resumo.participantes} recebem</span>}
            {publico && publico.resumo.excluidos > 0 && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-[#854F0B]" title="Passam nos filtros mas seriam pulados (opt-out, sem canal, sem fatura)">{publico.resumo.excluidos} pulados</span>}
            {publico && publico.resumo.valorAberto > 0 && <span className="text-xs text-muted">{brl(publico.resumo.valorAberto)} em aberto</span>}
            <button type="button" onClick={() => setVerContatos(true)} className="text-xs font-medium text-primary hover:underline">Ver participantes</button>
          </div>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.filtroTodos} onChange={(e) => set('filtroTodos', e.target.checked)} /> Todos os contatos</label>
          {!f.filtroTodos && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select value="" onChange={(e) => { const s = segmentos.find((x) => x.id === e.target.value); if (s) aplicarSegmento(s); }} className="rounded border border-line px-3 py-1.5 text-xs outline-none focus:border-primary">
                  <option value="">Carregar segmento salvo…</option>
                  {segmentos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {!salvandoSeg ? (
                  <button type="button" onClick={() => setSalvandoSeg(true)} className="text-xs font-medium text-primary hover:underline">Salvar filtros como segmento</button>
                ) : (
                  <span className="flex items-center gap-1">
                    <input autoFocus value={nomeSeg} onChange={(e) => setNomeSeg(e.target.value)} placeholder="Nome do segmento" className="rounded border border-line px-2 py-1 text-xs outline-none focus:border-primary" />
                    <button type="button" onClick={salvarSegmento} className="rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-hover">Salvar</button>
                    <button type="button" onClick={() => { setSalvandoSeg(false); setNomeSeg(''); }} className="text-xs text-muted hover:text-ink">cancelar</button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={f.filtroEtiqueta} onChange={(e) => set('filtroEtiqueta', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Etiqueta: qualquer</option>{etiquetas.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}</select>
                <select value={f.filtroFaixa} onChange={(e) => set('filtroFaixa', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Risco: qualquer</option><option value="BOM">Bom pagador</option><option value="ATENCAO">Atenção</option><option value="RISCO">Risco</option></select>
                <input value={f.filtroValorMin} onChange={(e) => set('filtroValorMin', e.target.value)} placeholder="Valor plano mín" className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <input value={f.filtroValorMax} onChange={(e) => set('filtroValorMax', e.target.value)} placeholder="Valor plano máx" className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <input value={f.filtroPlano} onChange={(e) => set('filtroPlano', e.target.value)} placeholder="Plano" className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <input value={f.filtroCidade} onChange={(e) => set('filtroCidade', e.target.value)} placeholder="Cidade" className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
                <select value={f.filtroStatus} onChange={(e) => set('filtroStatus', e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="">Situação: qualquer</option>
                  <option value="VENCIDA">Com fatura vencida</option>
                  <option value="PENDENTE">Com fatura a vencer</option>
                  <option value="ABERTO">Com fatura em aberto</option>
                  <option value="EM_DIA">Em dia (sem aberto)</option>
                </select>
                <input value={f.filtroDiasAtraso} onChange={(e) => set('filtroDiasAtraso', e.target.value)} inputMode="numeric" placeholder="Atraso mín. (dias)" title="Clientes com fatura vencida há pelo menos N dias" className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </>
          )}
        </div>

        <div className="mb-4">
          <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
            Quando enviar
            <Ajuda>
              <b>Uma vez:</b> dispara agora, uma única vez, e encerra.<br /><br />
              <b>Todo mês:</b> repete automaticamente todo mês, no dia que você escolher ao lado.<br /><br />
              <b>Sempre ativa:</b> fica ligada e envia para cada novo contato que entrar no público (útil com público dinâmico).
            </Ajuda>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {[['UMA_VEZ', 'Uma vez'], ['MENSAL', 'Todo mês'], ['SEMPRE_ATIVA', 'Sempre ativa']].map(([v, l]) => (
              <button key={v} onClick={() => set('agendamento', v)} className={`rounded border px-3 py-2 text-sm ${f.agendamento === v ? 'border-primary bg-primary-tint text-primary' : 'border-line hover:bg-canvas'}`}>{l}</button>
            ))}
            {f.agendamento === 'MENSAL' && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Dispara todo dia
                <input type="number" min={1} max={31} value={f.diaDoMes} onChange={(e) => set('diaDoMes', e.target.value)} className="w-16 rounded border border-line px-2 py-2 text-center text-sm text-ink outline-none focus:border-primary" />
                do mês
              </label>
            )}
          </div>
          {f.agendamento !== 'UMA_VEZ' && (
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-muted">Como o público se comporta a cada envio</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set('publicoDinamico', true)} className={`rounded border p-2 text-left ${f.publicoDinamico ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}>
                  <div className="text-sm font-medium text-ink">Automático <span className="text-xs font-normal text-muted">(recomendado)</span></div>
                  <div className="text-xs text-muted">Recalcula os filtros antes de cada envio: quem passou a dever entra, quem pagou sai.</div>
                </button>
                <button type="button" onClick={() => set('publicoDinamico', false)} className={`rounded border p-2 text-left ${!f.publicoDinamico ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}>
                  <div className="text-sm font-medium text-ink">Fixo</div>
                  <div className="text-xs text-muted">Congela os contatos de agora; os próximos envios vão só para esses (mesmo se pagarem, param de receber).</div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <span className="mb-1 block text-xs font-semibold text-muted">Intervalo entre mensagens</span>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={600} value={f.delaySegundos} onChange={(e) => set('delaySegundos', e.target.value)} className="w-24 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <span className="text-sm text-muted">segundos entre cada envio</span>
          </div>
          <p className="mt-1 text-xs text-muted">Espaça os envios em vez de disparar tudo de uma vez. Deixe 0 para enviar o mais rápido possível.</p>
        </div>

        {verContatos && <ContatosModal publico={publico} onRemover={(id) => { setExcluir((p) => [...new Set([...p, id])]); setIncluir((p) => p.filter((x) => x !== id)); }} onAdicionar={(id) => { setIncluir((p) => [...new Set([...p, id])]); setExcluir((p) => p.filter((x) => x !== id)); }} onClose={() => setVerContatos(false)} />}
        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar campanha'}</button>
        </div>
      </div>
    </div>
  );
}

interface Participante { id: string; nome: string; doc: string; situacao: string | null; valorAberto: number; faixa: string | null; motivo: string }
interface Excluido { id: string; nome: string; doc: string; motivo: string }
interface PublicoPreview { resumo: { participantes: number; excluidos: number; valorAberto: number; truncado?: boolean; limiteExibicao?: number }; participantes: Participante[]; excluidos: Excluido[] }

const tipoLabel = (c: Campaign) => c.tipoEnvio === 'REGUA' ? `Régua: ${c.rule?.nome || '—'}` : c.tipoEnvio === 'LEMBRETE' ? 'Lembrete de cobrança' : 'Mensagem única';

/** Revisão antes de disparar: mostra público final, régua/tipo, agendamento e quem será pulado. */
function RevisaoDisparoModal({ campanha, onConfirm, onClose }: { campanha: Campaign; onConfirm: () => void; onClose: () => void }) {
  const [pub, setPub] = useState<PublicoPreview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verExcluidos, setVerExcluidos] = useState(false);

  useEffect(() => {
    api<PublicoPreview>(`/campanhas/${campanha.id}/participantes`).then(setPub).catch(() => setPub(null)).finally(() => setCarregando(false));
  }, [campanha.id]);

  const semNinguem = !!pub && pub.resumo.participantes === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Revisar e disparar</h3>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-muted">Confira antes de colocar <b className="text-ink">{campanha.nome}</b> na fila de envio.</p>

        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-line px-3 py-2"><div className="text-xs text-muted">Como comunica</div><div className="font-medium text-ink">{tipoLabel(campanha)}</div></div>
          <div className="rounded border border-line px-3 py-2"><div className="text-xs text-muted">Quando</div><div className="font-medium text-ink">{agendaLabel(campanha)}</div></div>
          {campanha.agendamento !== 'UMA_VEZ' && (
            <div className="col-span-2 rounded border border-line px-3 py-2"><div className="text-xs text-muted">Público a cada envio</div><div className="font-medium text-ink">{campanha.publicoDinamico ? 'Automático (recalcula os filtros)' : 'Fixo (congela os contatos de agora)'}</div></div>
          )}
        </div>

        {carregando && <p className="text-sm text-muted">Calculando o público…</p>}
        {pub && (
          <>
            <div className="mb-2 rounded-lg border border-primary/30 bg-primary-tint px-4 py-3 text-sm">
              <span className="font-semibold text-primary">{pub.resumo.participantes}</span> <span className="text-ink">vão receber</span>
              {pub.resumo.valorAberto > 0 && <span className="text-muted"> · {brl(pub.resumo.valorAberto)} em aberto</span>}
            </div>
            {pub.resumo.excluidos > 0 && (
              <div className="mb-2 rounded-lg border border-warning/30 bg-warning-tint/40">
                <button onClick={() => setVerExcluidos((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-[#854F0B]">
                  <span>{pub.resumo.excluidos} não recebem (bloqueados)</span><span className="text-xs">{verExcluidos ? 'ocultar' : 'ver por quê'}</span>
                </button>
                {verExcluidos && (
                  <div className="max-h-40 overflow-auto border-t border-warning/30">
                    {pub.excluidos.map((e) => (
                      <div key={e.id} className="flex items-center justify-between px-3 py-1.5 text-sm"><span className="text-ink">{e.nome}</span><span className="text-xs text-muted">{e.motivo}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {semNinguem && <p className="mb-2 text-sm text-danger">Ninguém no público atende aos critérios agora — nada seria enviado.</p>}
          </>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={onConfirm} disabled={carregando || semNinguem} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40">Disparar agora</button>
        </div>
      </div>
    </div>
  );
}

const FAIXA_LABEL: Record<string, string> = { BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };
const situacaoBadge: Record<string, string> = { VENCIDA: 'bg-danger-tint text-[#A32D2D]', PENDENTE: 'bg-warning-tint text-[#854F0B]' };

function ContatosModal({ publico, onRemover, onAdicionar, onClose }: { publico: PublicoPreview | null; onRemover: (id: string) => void; onAdicionar: (id: string) => void; onClose: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState<{ id: string; nome: string; doc: string }[]>([]);
  const [q, setQ] = useState('');
  const [verExcluidos, setVerExcluidos] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!busca.trim()) { setResultado([]); return; }
      api<{ id: string; nome: string; doc: string }[]>(`/clientes?q=${encodeURIComponent(busca)}`).then((l) => setResultado(l.slice(0, 15))).catch(() => setResultado([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const participantes = publico?.participantes ?? [];
  const excluidos = publico?.excluidos ?? [];
  const idsAtuais = new Set(participantes.map((c) => c.id));
  const filtrados = participantes.filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()) || c.doc.includes(q));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Quem vai receber <span className="text-sm font-normal text-muted">({publico?.resumo.participantes ?? 0})</span></h3>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        {publico && publico.resumo.valorAberto > 0 && (
          <p className="mb-3 text-sm text-muted">Somam <b className="text-ink">{brl(publico.resumo.valorAberto)}</b> em aberto.</p>
        )}

        <div className="mb-3 rounded-lg border border-line p-2">
          <span className="mb-1 block text-xs font-medium text-muted">Adicionar contato manualmente</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF/CNPJ" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          {resultado.length > 0 && (
            <div className="mt-1 max-h-36 overflow-auto rounded border border-line">
              {resultado.map((r) => (
                <button key={r.id} disabled={idsAtuais.has(r.id)} onClick={() => { onAdicionar(r.id); setBusca(''); setResultado([]); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-canvas disabled:opacity-40">
                  <span><b className="text-ink">{r.nome}</b> <span className="text-muted">· {r.doc}</span></span>
                  <span className="text-xs text-primary">{idsAtuais.has(r.id) ? 'já incluso' : '+ adicionar'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar a lista abaixo" className="mb-2 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        <div className="flex-1 overflow-auto rounded-lg border border-line">
          <div className="w-full overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 border-b border-line bg-canvas text-left text-xs uppercase text-muted">
              <tr><th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 font-medium">Em aberto</th><th className="px-3 py-2 font-medium">Risco</th><th className="px-3 py-2 font-medium">Motivo</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><span className="text-ink">{c.nome}</span><br /><span className="tabular text-xs text-muted">{c.doc}</span></td>
                  <td className="px-3 py-2">{c.situacao ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoBadge[c.situacao] || 'bg-canvas text-muted'}`}>{c.situacao}</span> : <span className="text-muted">—</span>}</td>
                  <td className="tabular px-3 py-2 text-muted">{c.valorAberto > 0 ? brl(c.valorAberto) : '—'}</td>
                  <td className="px-3 py-2 text-muted">{c.faixa ? FAIXA_LABEL[c.faixa] || c.faixa : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{c.motivo}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => onRemover(c.id)} title="Remover do público" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">{publico ? 'Nenhum participante.' : 'Carregando...'}</td></tr>}
            </tbody>
          </table></div>
        </div>
        {publico?.resumo.truncado && <p className="mt-1 text-xs text-muted">Mostrando os primeiros {publico.resumo.limiteExibicao ?? 300} de {publico.resumo.participantes}. O envio atinge todos.</p>}

        {excluidos.length > 0 && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning-tint/40">
            <button onClick={() => setVerExcluidos((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-[#854F0B]">
              <span>{excluidos.length} pulado(s) — passam nos filtros mas não recebem</span>
              <span className="text-xs">{verExcluidos ? 'ocultar' : 'ver por quê'}</span>
            </button>
            {verExcluidos && (
              <div className="max-h-40 overflow-auto border-t border-warning/30">
                {excluidos.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="text-ink">{e.nome}</span>
                    <span className="text-xs text-muted">{e.motivo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover">Concluir</button>
        </div>
      </div>
    </div>
  );
}

function RelatorioModal({ campanha, onClose }: { campanha: Campaign; onClose: () => void }) {
  const [dados, setDados] = useState<{ run: Run | null; resumo?: { total: number; enviados: number; fila: number; falha: number }; destinatarios: { nome: string; doc?: string; canal?: string; destino?: string | null; status: string; enviadoEm?: string; erro?: string }[] } | null>(null);
  const [q, setQ] = useState('');

  const buscar = useCallback(async () => {
    const r = await api<{ run: Run | null; resumo?: { total: number; enviados: number; fila: number; falha: number }; destinatarios: { nome: string; doc?: string; canal?: string; destino?: string | null; status: string; enviadoEm?: string; erro?: string }[] }>(`/campanhas/${campanha.id}/relatorio`).catch(() => null);
    setDados(r ?? { run: null, destinatarios: [] });
  }, [campanha.id]);
  useEffect(() => { buscar(); }, [buscar]);

  // Acompanha o envio em tempo real: enquanto o worker tem disparos na fila,
  // recarrega a cada 3s e para sozinho quando a fila zera.
  const naFila = dados?.resumo?.fila ?? 0;
  useEffect(() => {
    if (naFila <= 0) return;
    const t = setInterval(buscar, 3000);
    return () => clearInterval(t);
  }, [naFila, buscar]);

  const filtrados = (dados?.destinatarios || []).filter((d) => !q || d.nome.toLowerCase().includes(q.toLowerCase()) || (d.doc || '').includes(q) || (d.destino || '').includes(q));

  function exportarCsv() {
    const linhas = [['nome', 'documento', 'destino', 'canal', 'status', 'enviadoEm', 'erro'], ...filtrados.map((d) => [d.nome, d.doc || '', d.destino || '', d.canal || '', d.status, dataHora(d.enviadoEm), (d.erro || '').replace(/[\n,;]/g, ' ')])];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `relatorio-${campanha.nome}.csv`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Relatório · {campanha.nome}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        {!dados ? <p className="text-sm text-muted">Carregando...</p> : !dados.run ? <p className="text-sm text-muted">Esta campanha ainda não foi disparada.</p> : (
          <>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border border-line p-3"><div className="text-xl font-semibold text-ink">{dados.resumo?.total ?? dados.run.totalContatos}</div><div className="text-xs text-muted">Público</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-xl font-semibold text-success">{dados.resumo?.enviados ?? 0}</div><div className="text-xs text-muted">Enviados</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-xl font-semibold text-[#854F0B]">{dados.resumo?.fila ?? 0}</div><div className="text-xs text-muted">Na fila</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-xl font-semibold text-danger">{dados.resumo?.falha ?? 0}</div><div className="text-xs text-muted">Falhas</div></div>
            </div>
            {naFila > 0
              ? <p className="mb-2 flex items-center gap-2 rounded bg-warning-tint px-3 py-2 text-xs text-[#854F0B]"><Loader2 size={13} className="shrink-0 animate-spin" /> Enviando: <b>{dados.resumo?.enviados ?? 0} de {dados.resumo?.total ?? 0}</b> concluídos, {naFila} na fila. Atualiza sozinho a cada 3s — pode deixar aberto. Se travar, confira se o <b>worker</b> está rodando e o canal está <b>conectado</b> em Canais.</p>
              : <p className="mb-2 rounded bg-success-tint px-3 py-2 text-xs text-[#0F6E56]">✓ Envio finalizado — {dados.resumo?.enviados ?? 0} de {dados.resumo?.total ?? 0} enviados{(dados.resumo?.falha ?? 0) > 0 ? `, ${dados.resumo?.falha} com falha` : ''}.</p>}
            <div className="mb-2 flex items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, documento ou telefone" className="flex-1 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
              <button onClick={exportarCsv} className="rounded border border-line px-3 py-2 text-sm hover:bg-canvas">Exportar CSV</button>
            </div>
            <div className="overflow-auto rounded-lg border border-line">
              <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead className="bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-3 py-2 font-medium">Nome</th><th className="px-3 py-2 font-medium">Documento</th><th className="px-3 py-2 font-medium">Telefone / e-mail</th><th className="px-3 py-2 font-medium">Canal</th><th className="px-3 py-2 font-medium">Enviado em</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
                <tbody>
                  {filtrados.map((d, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-3 py-2 text-ink">{d.nome}{d.erro && <div className="mt-0.5 max-w-xs break-words text-xs text-danger">{d.erro}</div>}</td>
                      <td className="tabular px-3 py-2 text-muted">{d.doc || '—'}</td>
                      <td className="tabular px-3 py-2 text-muted">{d.destino || '—'}</td>
                      <td className="px-3 py-2 text-muted">{d.canal || '—'}</td>
                      <td className="tabular px-3 py-2 text-muted">{dataHora(d.enviadoEm)}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${d.status === 'FALHA' || d.status === 'IGNORADO' ? 'bg-danger-tint text-[#A32D2D]' : d.status === 'ENVIADO' || d.status === 'ENTREGUE' || d.status === 'LIDO' ? 'bg-success-tint text-[#0F6E56]' : 'bg-canvas text-muted'}`}>{d.status}</span></td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">Nenhum destinatário.</td></tr>}
                </tbody>
              </table></div>
            </div>
            <p className="mt-2 text-xs text-muted">FILA = aguardando envio · ENVIADO/ENTREGUE/LIDO = saiu com sucesso · FALHA = não enviado. Atualiza conforme o worker processa (veja também a aba Disparos). Clique em Atualizar (recarregar) para ver o status mais recente.</p>
          </>
        )}
      </div>
    </div>
  );
}
