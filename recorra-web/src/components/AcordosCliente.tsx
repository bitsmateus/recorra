'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { brl } from '@/components/ui';

export interface Acordo {
  id: string;
  tipo: string | null;
  formaPagamento: string | null;
  dataAcordo: string | null;
  dataPrevista: string | null;
  valorOriginal: number | string;
  valorAcordado: number | string;
  descontoPct: number | string;
  parcelas: number;
  status: string;
  observacao: string | null;
  origem: string;
  criadoPorId: string | null;
  criadoPor?: { nome: string } | null;
  createdAt: string;
}

const FORMAS: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão', DINHEIRO: 'Dinheiro', TRANSFERENCIA: 'Transferência', OUTRO: 'Outro' };
const STATUS: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: 'Em andamento', cls: 'bg-primary-tint text-primary' },
  QUITADO: { label: 'Quitado', cls: 'bg-success-tint text-[#0F6E56]' },
  QUEBRADO: { label: 'Quebrado', cls: 'bg-danger-tint text-[#A32D2D]' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-canvas text-muted' },
};
const SUGESTOES = ['Pagamento à vista', 'Parcelamento', 'Desconto para quitar', 'Pagamento parcial', 'Troca de vencimento', 'Isenção de multa e juros', 'Reativação do plano', 'Renegociação de contrato'];
const GESTAO = ['OWNER', 'ADMIN', 'FINANCEIRO'];

const dia = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const paraNumero = (v: string) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const paraCampo = (v: number | string) => (Number(v) > 0 ? Number(v).toFixed(2).replace('.', ',') : '');

interface Form { tipo: string; formaPagamento: string; dataAcordo: string; dataPrevista: string; valorOriginal: string; valorAcordado: string; parcelas: string; status: string; observacao: string }
const vazio = (): Form => ({ tipo: '', formaPagamento: 'PIX', dataAcordo: hojeISO(), dataPrevista: '', valorOriginal: '', valorAcordado: '', parcelas: '1', status: 'ATIVO', observacao: '' });

/**
 * Acordos do cliente: o que foi combinado (tipo, forma de pagamento, datas, valor e
 * observação). Criar, editar e excluir; acordos de renegociação (que geraram faturas)
 * só editam tipo/forma/datas/status/obs e não podem ser excluídos.
 */
export function AcordosCliente({ customerId, acordos, onChange }: { customerId: string; acordos: Acordo[]; onChange: () => void }) {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [editando, setEditando] = useState<Acordo | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<Acordo | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { api<{ id: string; role: string }>('/usuarios/me').then(setMe).catch(() => {}); }, []);

  const podeExcluir = (a: Acordo) => a.origem === 'registro' && !!me && (GESTAO.includes(me.role) || a.criadoPorId === me.id);

  async function excluir() {
    if (!excluindo) return;
    try { await api(`/acordos/${excluindo.id}`, { method: 'DELETE' }); setExcluindo(null); onChange(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao excluir'); setExcluindo(null); }
  }

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="text-sm font-semibold text-ink">Acordos ({acordos.length})</div>
        <button onClick={() => setEditando('novo')} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"><Plus size={14} /> Registrar acordo</button>
      </div>
      <div className="p-2">
        {erro && <p className="px-2 py-1 text-xs text-danger">{erro}</p>}
        {acordos.map((a) => {
          const st = STATUS[a.status] ?? STATUS.ATIVO;
          const valor = Number(a.valorAcordado);
          return (
            <div key={a.id} className="border-b border-line px-2 py-2.5 text-sm last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-ink">{a.tipo ?? 'Renegociação de faturas'}</b>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                {a.formaPagamento && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">{FORMAS[a.formaPagamento] ?? a.formaPagamento}</span>}
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setEditando(a)} title="Editar acordo" aria-label="Editar acordo" className="rounded p-1 text-muted hover:bg-canvas hover:text-primary"><Pencil size={14} /></button>
                  {podeExcluir(a) && <button onClick={() => setExcluindo(a)} title="Excluir acordo" aria-label="Excluir acordo" className="rounded p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={14} /></button>}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                {dia(a.dataAcordo ?? a.createdAt) && <span>combinado em <b className="text-ink">{dia(a.dataAcordo ?? a.createdAt)}</b></span>}
                {dia(a.dataPrevista) && <span>pagar até <b className="text-ink">{dia(a.dataPrevista)}</b></span>}
                {valor > 0 && (
                  <span>
                    {Number(a.valorOriginal) > valor ? <>{brl(Number(a.valorOriginal))} → </> : null}<b className="text-primary">{brl(valor)}</b>
                    {a.parcelas > 1 ? ` em ${a.parcelas}x` : ''}{Number(a.descontoPct) > 0 ? ` · ${Number(a.descontoPct).toLocaleString('pt-BR')}% de desconto` : ''}
                  </span>
                )}
              </div>
              {a.observacao && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.observacao}</p>}
              <div className="mt-1 text-[11px] text-muted">
                {a.criadoPor?.nome ? `registrado por ${a.criadoPor.nome}` : a.origem === 'registro' ? 'registrado por usuário removido' : 'gerou parcelas e faturas'}
              </div>
            </div>
          );
        })}
        {acordos.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhum acordo. Use “Registrar acordo” para anotar o que foi combinado.</p>}
      </div>

      {editando && (
        <FormAcordo
          customerId={customerId} acordo={editando === 'novo' ? null : editando} onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); setErro(''); onChange(); }}
        />
      )}
      {excluindo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setExcluindo(null); }}>
          <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-ink">Excluir este acordo?</h2>
            <p className="mb-4 text-sm text-muted"><b className="text-ink">{excluindo.tipo}</b>{excluindo.dataPrevista ? ` · pagar até ${dia(excluindo.dataPrevista)}` : ''}. Isso não pode ser desfeito (fica só no registro de auditoria).</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setExcluindo(null)} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
              <button onClick={excluir} className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormAcordo({ customerId, acordo, onClose, onSalvo }: { customerId: string; acordo: Acordo | null; onClose: () => void; onSalvo: () => void }) {
  const reneg = !!acordo && acordo.origem !== 'registro';
  const inicial = useMemo<Form>(() => acordo ? {
    tipo: acordo.tipo ?? '', formaPagamento: acordo.formaPagamento ?? 'PIX',
    dataAcordo: (acordo.dataAcordo ?? acordo.createdAt).slice(0, 10), dataPrevista: acordo.dataPrevista ? acordo.dataPrevista.slice(0, 10) : '',
    valorOriginal: Number(acordo.valorOriginal) !== Number(acordo.valorAcordado) ? paraCampo(acordo.valorOriginal) : '',
    valorAcordado: paraCampo(acordo.valorAcordado), parcelas: String(acordo.parcelas), status: acordo.status, observacao: acordo.observacao ?? '',
  } : vazio(), [acordo]);
  const [f, setF] = useState<Form>(inicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const cls = 'w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60';

  async function salvar() {
    setErro('');
    if (f.tipo.trim().length < 2) return setErro('Escreva o tipo do acordo (ex.: Parcelamento).');
    const original = f.valorOriginal.trim() ? paraNumero(f.valorOriginal) : undefined;
    const acordado = f.valorAcordado.trim() ? paraNumero(f.valorAcordado) : undefined;
    if ((original !== undefined && Number.isNaN(original)) || (acordado !== undefined && Number.isNaN(acordado))) return setErro('Valor inválido. Use números, ex.: 300,00.');
    const parcelas = Number(f.parcelas) || 1;
    setBusy(true);
    const comum = {
      tipo: f.tipo.trim(), formaPagamento: f.formaPagamento, dataAcordo: f.dataAcordo || undefined,
      dataPrevista: f.dataPrevista || (acordo ? '' : undefined), observacao: f.observacao,
    };
    const valores = reneg ? {} : { valorOriginal: original, valorAcordado: acordado, parcelas };
    try {
      if (acordo) await api(`/acordos/${acordo.id}`, { method: 'PUT', body: { ...comum, ...valores, status: f.status } });
      else await api('/acordos/registro', { method: 'POST', body: { customerId, ...comum, ...valores } });
      onSalvo();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-lg">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{acordo ? 'Editar acordo' : 'Registrar acordo'}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-muted">
          {reneg ? 'Este acordo gerou parcelas e faturas: aqui você ajusta o tipo, a forma de pagamento, as datas, o status e a observação.'
            : 'Anote o que foi combinado com o cliente. O registro não gera nem cancela faturas.'}
        </p>

        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Tipo do acordo *</span>
          <input list="tipos-acordo" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} maxLength={60} placeholder="Escreva ou escolha: Parcelamento, Desconto para quitar…" className={cls} />
          <datalist id="tipos-acordo">{SUGESTOES.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Forma de pagamento *</span>
            <select value={f.formaPagamento} onChange={(e) => set('formaPagamento', e.target.value)} className={cls}>
              {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {acordo ? (
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Situação</span>
              <select value={f.status} onChange={(e) => set('status', e.target.value)} className={cls}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          ) : <div />}
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Data do acordo</span>
            <input type="date" value={f.dataAcordo} onChange={(e) => set('dataAcordo', e.target.value)} className={cls} />
          </label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Pagar até / 1ª parcela</span>
            <input type="date" value={f.dataPrevista} onChange={(e) => set('dataPrevista', e.target.value)} className={cls} />
          </label>
        </div>
        {!reneg && (
          <div className="mb-3 grid grid-cols-3 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor da dívida (R$)</span>
              <input inputMode="decimal" value={f.valorOriginal} onChange={(e) => set('valorOriginal', e.target.value)} placeholder="opcional" className={cls} />
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor acordado (R$)</span>
              <input inputMode="decimal" value={f.valorAcordado} onChange={(e) => set('valorAcordado', e.target.value)} placeholder="opcional" className={cls} />
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Parcelas</span>
              <input type="number" min={1} max={72} value={f.parcelas} onChange={(e) => set('parcelas', e.target.value)} className={cls} />
            </label>
          </div>
        )}
        <label className="mb-3 block text-sm"><span className="mb-1 block text-xs text-muted">Observação</span>
          <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} rows={4} maxLength={1000} placeholder="O que ficou combinado, quem falou com o cliente, condições…" className={cls} />
        </label>

        {erro && <p className="mb-2 text-sm text-danger">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
