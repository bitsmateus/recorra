'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, X, Trash2, Pencil, RefreshCw, MessageCircle, Search, ExternalLink, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MessagePreview } from '@/components/MessagePreview';

interface Template {
  id: string; nome: string; corpo: string; idioma: string;
  categoria: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  status: 'APROVADO' | 'PENDENTE' | 'REJEITADO' | 'RASCUNHO';
  externalId?: string | null;
}
interface Conta { wabaId: string; origem: string }

const statusInfo: Record<string, { label: string; cls: string; dica: string }> = {
  APROVADO: { label: 'Aprovado', cls: 'bg-success-tint text-[#0F6E56]', dica: 'Pronto para enviar.' },
  PENDENTE: { label: 'Em revisão', cls: 'bg-warning-tint text-[#854F0B]', dica: 'A Meta está analisando — não dá para enviar ainda.' },
  REJEITADO: { label: 'Rejeitado', cls: 'bg-danger-tint text-[#A32D2D]', dica: 'A Meta recusou. Edite o texto e reenvie para revisão.' },
  RASCUNHO: { label: 'Rascunho', cls: 'bg-canvas text-muted', dica: 'Ainda não existe na Meta.' },
};
const catInfo: Record<string, { label: string; cls: string }> = {
  UTILITY: { label: 'Utilidade', cls: 'bg-primary-tint text-primary' },
  MARKETING: { label: 'Marketing', cls: 'bg-danger-tint text-[#A32D2D]' },
  AUTHENTICATION: { label: 'Autenticação', cls: 'bg-canvas text-muted' },
};

const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';
/** Posições das variáveis do corpo, na ordem: "{{1}} {{2}}" → [1, 2]. */
const varsDoCorpo = (corpo: string): number[] => {
  const s = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo || ''))) s.add(Number(m[1]));
  return [...s].sort((a, b) => a - b);
};

export default function TemplatesPage() {
  const [lista, setLista] = useState<Template[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Template | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<Template | null>(null);
  const [previa, setPrevia] = useState<Template | null>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('');
  const [sync, setSync] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const [t, c] = await Promise.all([
      api<Template[]>('/config/templates').catch(() => []),
      api<Conta[]>('/config/templates/contas').catch(() => []),
    ]);
    setLista(t); setContas(c);
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setSync(true); setMsg('Buscando na Meta...');
    try {
      const r = await api<{ canais: number; importados: number; atualizados: number; removidos: number; erros: string[] }>('/config/templates/sincronizar', { method: 'POST' });
      const p = [`${r.importados} novo(s)`, `${r.atualizados} atualizado(s)`];
      if (r.removidos) p.push(`${r.removidos} removido(s) na Meta`);
      setMsg(`✓ ${p.join(' · ')} — ${r.canais} conta(s)${r.erros?.length ? ` · aviso: ${r.erros[0]}` : ''}`);
      carregar();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'); }
    finally { setSync(false); }
  }

  async function remover(t: Template) {
    setMsg('Excluindo na Meta...');
    try { await api(`/config/templates/${t.id}`, { method: 'DELETE' }); setMsg('✓ Template excluído na Meta.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao excluir'); }
    setExcluir(null); carregar();
  }

  const filtrados = lista.filter((t) =>
    (!q || t.nome.toLowerCase().includes(q.toLowerCase()) || t.corpo.toLowerCase().includes(q.toLowerCase())) &&
    (!filtro || t.status === filtro));

  const semConta = !loading && contas.length === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Templates do WhatsApp" subtitle="Os templates ficam na Meta e passam por aprovação. Aqui você cria, edita e exclui direto lá." />
        <div className="flex flex-wrap gap-2">
          <button onClick={sincronizar} disabled={sync} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas disabled:opacity-60">
            <RefreshCw size={15} className={sync ? 'animate-spin' : ''} /> Sincronizar
          </button>
          <button onClick={() => setEdit('novo')} disabled={semConta} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            <Plus size={16} /> Novo template
          </button>
        </div>
      </div>

      {semConta && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-tint px-4 py-3 text-sm text-[#854F0B]">
          <Info size={16} className="mt-0.5 shrink-0" />
          <div>
            Nenhuma conta do WhatsApp oficial conectada — sem ela não dá para gerenciar templates.
            Conecte o <b>NX Systems</b> ou informe o <b>WABA ID</b> no canal WhatsApp API oficial em <Link href="/canais" className="underline">Canais</Link>.
          </div>
        </div>
      )}
      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou texto" className={`${inputCls} pl-9`} />
        </div>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">Status: todos</option>
          <option value="APROVADO">Aprovado</option>
          <option value="PENDENTE">Em revisão</option>
          <option value="REJEITADO">Rejeitado</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((t) => (
          <div key={t.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-sm font-medium text-ink">{t.nome}</span>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => setPrevia(t)} title="Pré-visualizar" className="rounded p-1 text-muted hover:bg-canvas hover:text-primary"><MessageCircle size={14} /></button>
                <button onClick={() => setEdit(t)} title="Editar na Meta" className="rounded p-1 text-muted hover:bg-canvas hover:text-primary"><Pencil size={14} /></button>
                <button onClick={() => setExcluir(t)} title="Excluir na Meta" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusInfo[t.status]?.cls}`} title={statusInfo[t.status]?.dica}>{statusInfo[t.status]?.label ?? t.status}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${catInfo[t.categoria]?.cls}`}>{catInfo[t.categoria]?.label ?? t.categoria}</span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">{t.idioma}</span>
            </div>
            <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-xs text-muted">{t.corpo || '(sem corpo)'}</p>
            {t.categoria === 'MARKETING' && (
              <p className="mt-2 text-[11px] text-danger">Marketing tem limite de frequência e custa mais. Em cobrança, prefira Utilidade.</p>
            )}
          </div>
        ))}
        {!loading && filtrados.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">
            {lista.length === 0 ? 'Nenhum template. Use "Sincronizar" para trazer os que já existem na Meta, ou crie um novo.' : 'Nada encontrado com esse filtro.'}
          </div>
        )}
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {edit && <TemplateModal template={edit === 'novo' ? null : edit} contas={contas} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); setMsg(m); carregar(); }} />}
      {previa && <MessagePreview canal="WHATSAPP_CLOUD" texto={previa.corpo} onClose={() => setPrevia(null)} />}
      {excluir && (
        <ConfirmDialog
          titulo="Excluir na Meta"
          mensagem={<>Excluir <b className="text-ink">{excluir.nome}</b> <b>na Meta</b>, não só aqui. A Meta bloqueia reutilizar esse nome por <b>30 dias</b>, e campanhas que o usam passam a falhar.</>}
          confirmLabel="Excluir na Meta"
          onConfirm={() => remover(excluir)}
          onClose={() => setExcluir(null)}
        />
      )}
    </div>
  );
}

function TemplateModal({ template, contas, onClose, onSaved }: {
  template: Template | null; contas: Conta[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const editando = !!template;
  const [nome, setNome] = useState(template?.nome || '');
  const [corpo, setCorpo] = useState(template?.corpo || '');
  const [idioma, setIdioma] = useState(template?.idioma || 'pt_BR');
  const [categoria, setCategoria] = useState(template?.categoria || 'UTILITY');
  const [wabaId, setWabaId] = useState(contas[0]?.wabaId || '');
  const [exemplos, setExemplos] = useState<string[]>([]);
  const [sugestao, setSugestao] = useState<{ categoria: string; alertaCusto: boolean } | null>(null);
  const [previa, setPrevia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const vars = varsDoCorpo(corpo);
  // A Meta recusa buracos: {{1}} e {{3}} sem {{2}} não passa.
  const sequencial = vars.every((n, i) => n === i + 1);

  useEffect(() => {
    if (corpo.length < 9) return;
    const t = setTimeout(() => {
      api<{ categoria: string; alertaCusto: boolean }>('/config/templates/categorizar', { method: 'POST', body: { corpo } })
        .then(setSugestao).catch(() => setSugestao(null));
    }, 400);
    return () => clearTimeout(t);
  }, [corpo]);

  async function salvar() {
    if (!editando && !/^[a-z0-9_]+$/.test(nome)) return setMsg('O nome só aceita letras minúsculas, números e underscore — é regra da Meta.');
    if (!corpo.trim()) return setMsg('Escreva o corpo do template.');
    if (!sequencial) return setMsg('As variáveis precisam ser {{1}}, {{2}}, {{3}}... sem pular número.');
    setBusy(true); setMsg('');
    try {
      const body = { nome, corpo, idioma, categoria, exemplos, wabaId: wabaId || undefined };
      if (editando) {
        await api(`/config/templates/${template!.id}`, { method: 'PUT', body });
        onSaved('✓ Enviado para revisão da Meta — o template volta a ficar disponível quando aprovarem.');
      } else {
        await api('/config/templates', { method: 'POST', body });
        onSaved('✓ Criado na Meta e enviado para revisão. Costuma aprovar em minutos, mas pode levar até 24h.');
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{editando ? 'Editar na Meta' : 'Novo template'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {editando
            ? 'Nome e idioma não mudam na Meta. Salvar devolve o template para revisão.'
            : 'O template é criado na Meta e entra em revisão — só dá para enviar depois de aprovado.'}
        </p>

        {editando && template?.status === 'REJEITADO' && (
          <p className="mb-3 rounded bg-danger-tint px-3 py-2 text-xs text-[#A32D2D]">A Meta rejeitou este template. Ajuste o texto e salve para reenviar.</p>
        )}

        {!editando && contas.length > 1 && (
          <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Criar em qual conta</span>
            <select value={wabaId} onChange={(e) => setWabaId(e.target.value)} className={inputCls}>
              {contas.map((c) => <option key={c.wabaId} value={c.wabaId}>{c.origem} · {c.wabaId}</option>)}
            </select>
          </label>
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Nome *</span>
            <input value={nome} disabled={editando} onChange={(e) => setNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="boleto_gerado" className={`${inputCls} font-mono disabled:bg-canvas disabled:text-muted`} />
            <span className="mt-1 block text-xs text-muted">{editando ? 'Imutável na Meta.' : 'Minúsculas, números e underscore.'}</span>
          </label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Idioma *</span>
            <select value={idioma} disabled={editando} onChange={(e) => setIdioma(e.target.value)} className={`${inputCls} disabled:bg-canvas disabled:text-muted`}>
              <option value="pt_BR">Português (pt_BR)</option>
              <option value="en">Inglês (en)</option>
              <option value="es">Espanhol (es)</option>
            </select>
            <span className="mt-1 block text-xs text-muted">{editando ? 'Imutável na Meta.' : 'Precisa bater com o idioma do texto.'}</span>
          </label>
        </div>

        <label className="mb-2 block text-sm"><span className="mb-1 block text-xs text-muted">Corpo * — use {'{{1}}'}, {'{{2}}'}... nas variáveis</span>
          <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={5} placeholder={'Olá {{1}}, sua fatura de {{2}} vence em {{3}}.'} className={inputCls} />
          <span className="mt-1 block text-xs text-muted">{corpo.length}/1024 caracteres. Na campanha você liga cada {'{{n}}'} a um dado do cliente.</span>
        </label>

        {!sequencial && <p className="mb-2 text-xs text-danger">As variáveis precisam ser sequenciais: {'{{1}}, {{2}}, {{3}}'}... sem pular número — a Meta recusa.</p>}

        {vars.length > 0 && sequencial && (
          <div className="mb-3 space-y-2 rounded border border-line p-2">
            <span className="block text-xs font-semibold text-muted">Exemplo de cada variável (a Meta exige para revisar)</span>
            {vars.map((n) => (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 font-mono text-xs text-muted">{`{{${n}}}`}</span>
                <input
                  value={exemplos[n - 1] ?? ''}
                  onChange={(e) => setExemplos((p) => { const x = [...p]; x[n - 1] = e.target.value; return x; })}
                  placeholder={n === 1 ? 'João Silva' : n === 2 ? 'R$ 149,90' : '15/07/2026'}
                  className={inputCls}
                />
              </div>
            ))}
            <span className="block text-xs text-muted">São só para o revisor da Meta ver o texto preenchido — não vão para o cliente.</span>
          </div>
        )}

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Categoria</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Template['categoria'])} className={inputCls}>
            <option value="UTILITY">Utilidade — cobrança, aviso de fatura (mais barato)</option>
            <option value="MARKETING">Marketing — promoção (tem limite de frequência)</option>
            <option value="AUTHENTICATION">Autenticação — código de verificação</option>
          </select>
        </label>

        {sugestao && (
          <p className="mb-3 text-xs">
            Pelo texto, parece <b className="text-ink">{catInfo[sugestao.categoria]?.label ?? sugestao.categoria}</b>.
            {sugestao.alertaCusto && <span className="ml-1 text-danger">É cobrança mas está como marketing — a Meta limita a entrega e cobra mais. Use Utilidade.</span>}
          </p>
        )}

        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-between gap-2">
          <button onClick={() => setPrevia(true)} className="flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm hover:bg-canvas"><MessageCircle size={14} /> Pré-visualizar</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
            <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
              {busy ? 'Enviando à Meta...' : editando ? 'Salvar e reenviar' : 'Criar e enviar para revisão'}
            </button>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-muted">
          <ExternalLink size={11} /> A aprovação é da Meta — a Recorrai não controla o prazo nem o resultado.
        </p>
      </div>
      {previa && <MessagePreview canal="WHATSAPP_CLOUD" texto={corpo} onClose={() => setPrevia(false)} />}
    </div>
  );
}
