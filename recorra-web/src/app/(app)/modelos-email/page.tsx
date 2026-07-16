'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Trash2, Pencil, Mail, Palette, Download, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MessagePreview } from '@/components/MessagePreview';

interface Modelo { id: string; nome: string; assunto: string; corpo: string }
interface ModeloBiblioteca { id: string; nome: string; assunto: string; corpo: string }
interface Marca { empresa?: string; cor?: string; logoUrl?: string; assinatura?: string }

// Variáveis trocadas pelos dados do cliente no envio. Valem no assunto e no corpo.
const VARS = ['{{nome}}', '{{valor}}', '{{vencimento}}', '{{link}}', '{{boleto}}', '{{pix}}', '{{documento}}'];

const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';

export default function ModelosEmailPage() {
  const [lista, setLista] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Modelo | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<Modelo | null>(null);
  const [verMarca, setVerMarca] = useState(false);
  const [biblioteca, setBiblioteca] = useState<ModeloBiblioteca[]>([]);
  const [verBiblioteca, setVerBiblioteca] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const [m, b] = await Promise.all([
      api<Modelo[]>('/modelos-email').catch(() => []),
      api<ModeloBiblioteca[]>('/modelos-email/biblioteca').catch(() => []),
    ]);
    setLista(m); setBiblioteca(b);
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function remover(m: Modelo) {
    await api(`/modelos-email/${m.id}`, { method: 'DELETE' }).catch((e) => setMsg(e.message));
    setExcluir(null); carregar();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Modelos de e-mail" subtitle="Escreva uma vez e reutilize nas campanhas. O layout (logo, cores, rodapé) é aplicado no envio." />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setVerMarca(true)} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas"><Palette size={15} /> Marca do e-mail</button>
          {biblioteca.length > 0 && (
            <button onClick={() => setVerBiblioteca(true)} className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary-tint px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white"><Download size={15} /> Usar modelo pronto ({biblioteca.length})</button>
          )}
          <button onClick={() => setEdit('novo')} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Novo modelo</button>
        </div>
      </div>
      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((m) => (
          <div key={m.id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Mail size={16} className="shrink-0 text-primary" />
                <span className="truncate font-medium text-ink">{m.nome}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => setEdit(m)} title="Editar" className="rounded p-1 text-muted hover:bg-canvas hover:text-primary"><Pencil size={14} /></button>
                <button onClick={() => setExcluir(m)} title="Excluir" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mb-1 text-xs text-muted">Assunto</div>
            <div className="mb-2 line-clamp-1 text-sm text-ink">{m.assunto}</div>
            <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-xs text-muted">{m.corpo}</p>
          </div>
        ))}
        {!loading && lista.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">
            Nenhum modelo ainda. Use <b className="text-ink">&quot;Usar modelo pronto&quot;</b> para começar com textos prontos, ou crie o seu.
          </div>
        )}
      </div>
      {loading && <p className="mt-3 text-sm text-muted">Carregando...</p>}

      {edit && <ModeloModal modelo={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); carregar(); }} />}
      {verMarca && <MarcaModal onClose={() => setVerMarca(false)} />}
      {verBiblioteca && <BibliotecaModal modelos={biblioteca} onClose={() => setVerBiblioteca(false)} onImportado={() => { setVerBiblioteca(false); carregar(); }} />}
      {excluir && (
        <ConfirmDialog
          titulo="Excluir modelo"
          mensagem={<>Excluir o modelo <b className="text-ink">{excluir.nome}</b>? As campanhas que já usaram este texto não mudam — elas guardam a própria cópia.</>}
          confirmLabel="Excluir"
          onConfirm={() => remover(excluir)}
          onClose={() => setExcluir(null)}
        />
      )}
    </div>
  );
}

function ModeloModal({ modelo, onClose, onSaved }: { modelo: Modelo | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(modelo?.nome || '');
  const [assunto, setAssunto] = useState(modelo?.assunto || '');
  const [corpo, setCorpo] = useState(modelo?.corpo || '');
  const [previa, setPrevia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function salvar() {
    if (!nome.trim()) return setMsg('Dê um nome ao modelo.');
    if (!assunto.trim()) return setMsg('Escreva o assunto.');
    if (!corpo.trim()) return setMsg('Escreva o corpo do e-mail.');
    setBusy(true); setMsg('');
    try {
      const body = { nome, assunto, corpo };
      if (modelo) await api(`/modelos-email/${modelo.id}`, { method: 'PUT', body });
      else await api('/modelos-email', { method: 'POST', body });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{modelo ? 'Editar modelo' : 'Novo modelo'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome do modelo *</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lembrete antes do vencimento" className={inputCls} />
          <span className="mt-1 block text-xs text-muted">Só para você identificar — o cliente não vê.</span>
        </label>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Assunto *</span>
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: {{nome}}, sua fatura vence em {{vencimento}}" className={inputCls} />
        </label>

        <label className="mb-2 block text-sm"><span className="mb-1 block text-xs text-muted">Corpo *</span>
          <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={9} placeholder={'Olá {{nome}},\n\nSua fatura de {{valor}} vence em {{vencimento}}.\n\n{{link}}'} className={inputCls} />
        </label>

        <div className="mb-4 rounded bg-canvas p-2 text-xs text-muted">
          <b className="text-ink">Variáveis:</b>{' '}
          {VARS.map((v) => (
            <button key={v} type="button" onClick={() => setCorpo((c) => `${c}${c && !c.endsWith('\n') ? ' ' : ''}${v}`)} className="mr-1 rounded bg-surface px-1.5 py-0.5 font-mono text-primary hover:bg-primary-tint">{v}</button>
          ))}
          <span className="mt-1 block">Clique para inserir no corpo; no assunto, digite manualmente. Um link no texto vira o botão de pagamento automaticamente.</span>
        </div>

        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-between gap-2">
          <button onClick={() => setPrevia(true)} className="flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm hover:bg-canvas"><Mail size={14} /> Pré-visualizar</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
            <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar modelo'}</button>
          </div>
        </div>
      </div>
      {previa && <MessagePreview canal="EMAIL" texto={corpo} assunto={assunto} onClose={() => setPrevia(false)} />}
    </div>
  );
}

function BibliotecaModal({ modelos, onClose, onImportado }: { modelos: ModeloBiblioteca[]; onClose: () => void; onImportado: () => void }) {
  const [sel, setSel] = useState<string[]>(modelos.map((m) => m.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const alterna = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function importar() {
    if (!sel.length) return setMsg('Selecione ao menos um modelo.');
    setBusy(true); setMsg('');
    try { await api('/modelos-email/importar', { method: 'POST', body: { ids: sel } }); onImportado(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Modelos prontos</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">Vira uma cópia sua — depois de importar, edite à vontade.</p>

        <div className="mb-4 space-y-2">
          {modelos.map((m) => (
            <label key={m.id} className={`flex cursor-pointer gap-3 rounded border p-3 ${sel.includes(m.id) ? 'border-primary bg-primary-tint' : 'border-line hover:bg-canvas'}`}>
              <input type="checkbox" checked={sel.includes(m.id)} onChange={() => alterna(m.id)} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ink"><Copy size={13} className="text-muted" /> {m.nome}</div>
                <div className="mt-0.5 truncate text-xs text-muted">{m.assunto}</div>
              </div>
            </label>
          ))}
        </div>

        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={importar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Importando...' : `Importar ${sel.length}`}</button>
        </div>
      </div>
    </div>
  );
}

function MarcaModal({ onClose }: { onClose: () => void }) {
  const [m, setM] = useState<Marca>({});
  const [carregando, setCarregando] = useState(true);
  const [previa, setPrevia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: keyof Marca, v: string) => setM((s) => ({ ...s, [k]: v }));

  useEffect(() => { api<Marca>('/modelos-email/marca').then((r) => { setM(r || {}); setCarregando(false); }).catch(() => setCarregando(false)); }, []);

  async function salvar() {
    setBusy(true); setMsg('');
    try { await api('/modelos-email/marca', { method: 'PUT', body: m }); onClose(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Marca do e-mail</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">Vale para todos os e-mails enviados. É a sua marca que o cliente vê — não a da Recorrai.</p>

        {carregando ? <p className="text-sm text-muted">Carregando...</p> : (
          <>
            <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Nome da empresa</span>
              <input value={m.empresa || ''} onChange={(e) => set('empresa', e.target.value)} placeholder="Aparece no cabeçalho" className={inputCls} />
            </label>

            <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Cor do cabeçalho e do botão</span>
              <div className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(m.cor || '') ? m.cor : '#14857C'} onChange={(e) => set('cor', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" />
                <input value={m.cor || ''} onChange={(e) => set('cor', e.target.value)} placeholder="#14857C" className={`${inputCls} font-mono text-xs`} />
              </div>
            </label>

            <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Logo (URL pública)</span>
              <input value={m.logoUrl || ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://seusite.com.br/logo.png" className={`${inputCls} font-mono text-xs`} />
              <span className="mt-1 block text-xs text-muted">Precisa ser um endereço público na internet — o e-mail é aberto fora da Recorrai e não enxerga arquivos daqui. Sem logo, mostramos o nome da empresa.</span>
            </label>

            <label className="mb-4 block text-sm"><span className="mb-1 block text-xs text-muted">Assinatura do rodapé (opcional)</span>
              <input value={m.assinatura || ''} onChange={(e) => set('assinatura', e.target.value)} placeholder="CNPJ 00.000.000/0001-00 · (11) 4000-0000" className={inputCls} />
            </label>

            {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
            <div className="flex justify-between gap-2">
              <button onClick={() => setPrevia(true)} className="flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm hover:bg-canvas"><Mail size={14} /> Pré-visualizar</button>
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
                <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </>
        )}
      </div>
      {previa && (
        <MessagePreview
          canal="EMAIL"
          assunto="{{nome}}, sua fatura vence em {{vencimento}}"
          texto={'Olá {{nome}},\n\nSua fatura de {{valor}} vence em {{vencimento}}.\n\n{{link}}'}
          onClose={() => setPrevia(false)}
        />
      )}
    </div>
  );
}
