'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, MessageCircle, Mail, Smartphone, RefreshCw, Sparkles, X, Webhook, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';
import { PreviewButton } from '@/components/MessagePreview';

type Canal = 'WHATSAPP_CLOUD' | 'WHATSAPP_EVOLUTION' | 'WHATSAPP_UAZAPI' | 'EMAIL' | 'SMS' | 'HTTP_GENERIC' | 'NX_SYSTEMS';
type Faixa = 'BOM' | 'ATENCAO' | 'RISCO' | '';

interface Step {
  ordem: number;
  offsetDias: number;
  canal: Canal;
  channelAccountId?: string;
  canaisFallback?: Canal[];
  template: string;
  emailAssunto?: string; // assunto do e-mail deste passo (só no canal EMAIL)
  templateB?: string;
  abTest?: boolean;
  templateName?: string; // nome do template aprovado (canal oficial)
  templateParams?: string[]; // variáveis Recorrai que preenchem {{1}}, {{2}}...
}
interface Rule {
  id?: string;
  nome: string;
  faixaRisco?: Faixa;
  apenasNotificar?: boolean;
  janelaInicio?: number;
  janelaFim?: number;
  diasUteisSomente?: boolean;
  maxMsgsDia?: number | null;
  roteamentoPorCusto?: boolean;
  ativo?: boolean;
  steps: Step[];
  campaigns?: { id: string; nome: string; status: string }[];
}

const canalLabel: Record<Canal, { label: string; icon: typeof MessageCircle }> = {
  WHATSAPP_CLOUD: { label: 'WhatsApp (oficial)', icon: MessageCircle },
  EMAIL: { label: 'E-mail', icon: Mail },
  SMS: { label: 'SMS', icon: Smartphone },
  HTTP_GENERIC: { label: 'API genérica (HTTP)', icon: Webhook },
  NX_SYSTEMS: { label: 'NX Systems', icon: MessageSquare },
  // Legados: não é mais possível criar, mas ainda podem existir no banco.
  WHATSAPP_EVOLUTION: { label: 'WhatsApp (Evolution)', icon: MessageCircle },
  WHATSAPP_UAZAPI: { label: 'WhatsApp (uazapi)', icon: MessageCircle },
};

/** WhatsApp só envia por template aprovado; texto livre sobra para SMS e e-mail. */
const CANAIS_WHATSAPP: string[] = ['WHATSAPP_CLOUD', 'NX_SYSTEMS', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI'];
const ehWhatsApp = (canal?: string) => !!canal && CANAIS_WHATSAPP.includes(canal);

const faixaLabel: Record<string, string> = { '': 'Todas as faixas', BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };

// Variáveis da Recorrai que podem preencher as posições {{1}}, {{2}}... de um template aprovado.
const RECORRA_VARS: { token: string; label: string }[] = [
  { token: '{{nome}}', label: 'Nome do cliente' },
  { token: '{{valor}}', label: 'Valor da fatura' },
  { token: '{{vencimento}}', label: 'Data de vencimento' },
  { token: '{{pix}}', label: 'Pix copia e cola' },
  { token: '{{link}}', label: 'Link de pagamento' },
  { token: '{{contrato}}', label: 'Contrato' },
];

/** Maior índice de variável posicional ({{1}}, {{2}}...) presente no corpo do template. */
function maxVarPos(corpo: string): number {
  let n = 0;
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo))) n = Math.max(n, Number(m[1]));
  return n;
}

/** Troca cada {{k}} do corpo pela variável Recorrai mapeada (mantém {{k}} se ainda não mapeada). */
function aplicarMapa(corpo: string, mapa: string[]): string {
  return corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => mapa[Number(n) - 1] || `{{${n}}}`);
}

function novaRegua(): Rule {
  return {
    nome: 'Nova régua',
    faixaRisco: '',
    janelaInicio: 9,
    janelaFim: 20,
    diasUteisSomente: false,
    roteamentoPorCusto: false,
    steps: [{ ordem: 1, offsetDias: -3, canal: 'WHATSAPP_CLOUD', template: 'Olá {{nome}}, sua fatura de {{valor}} vence em {{vencimento}}. Pix: {{pix}}' }],
  };
}

// ── Linha do tempo visual da régua (inspirada no fluxo horizontal de cadência) ──
const pad2 = (n: number) => String(n).padStart(2, '0');

function faseInfo(offset: number): { key: string; header: string; cor: string } {
  if (offset < 0) return { key: 'antes', header: 'Antes do vencimento', cor: '#7C3AED' };
  if (offset === 0) return { key: 'dia', header: 'No dia do vencimento', cor: '#14857C' };
  return { key: 'depois', header: 'Depois do vencimento', cor: '#F0A93B' };
}

type TLCol = { key: string; header: string; cor: string; day: string; canais: Canal[] };

const COR_EXTRAJUDICIAL = '#EF4444';

function montarColunas(steps: Step[]): TLCol[] {
  // Agrupa passos que caem no mesmo dia (mostra os canais juntos, como no fluxo real).
  const porDia = new Map<number, Canal[]>();
  for (const s of steps) porDia.set(s.offsetDias, [...(porDia.get(s.offsetDias) || []), s.canal]);

  const nodes: TLCol[] = [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offset, canais]) => ({ ...faseInfo(offset), day: pad2(Math.abs(offset)), canais }));

  // O último toque, quando é "depois do vencimento", vira notificação extrajudicial (vermelho).
  const ultimo = nodes[nodes.length - 1];
  if (ultimo && ultimo.key === 'depois') {
    ultimo.key = 'extrajudicial';
    ultimo.header = 'Notificação extrajudicial';
    ultimo.cor = COR_EXTRAJUDICIAL;
  }

  return [{ key: 'emissao', header: 'Emissão', cor: '#94A3B8', day: '—', canais: [] }, ...nodes];
}

const LEGENDA: { label: string; cor: string }[] = [
  { label: 'Antes do vencimento', cor: '#7C3AED' },
  { label: 'No dia', cor: '#14857C' },
  { label: 'Depois', cor: '#F0A93B' },
  { label: 'Extrajudicial', cor: COR_EXTRAJUDICIAL },
];

function ReguaTimeline({ steps, compact = false }: { steps: Step[]; compact?: boolean }) {
  if (!steps.length) {
    return compact ? null : <p className="text-sm text-muted">Adicione passos para ver a linha do tempo.</p>;
  }

  const cols = montarColunas(steps);

  // Modo compacto: só os pontos coloridos (para caber nos cards da lista).
  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto">
        {cols.map((c, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <span className="h-[2px] w-2 shrink-0" style={{ background: c.cor }} />}
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor }} title={`${c.header} ${c.day}`} />
          </div>
        ))}
      </div>
    );
  }

  // Segmentos por fase (cabeçalhos agrupam colunas consecutivas da mesma fase).
  const segs: { header: string; cols: TLCol[] }[] = [];
  for (const c of cols) {
    const last = segs[segs.length - 1];
    if (last && last.header === c.header) last.cols.push(c);
    else segs.push({ header: c.header, cols: [c] });
  }

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max">
          {segs.map((seg, si) => (
            <div key={si} className="flex flex-col">
              <div className="mb-3 px-2 text-center text-[11px] font-medium leading-tight text-muted">{seg.header}</div>
              <div className="flex">
                {seg.cols.map((c, ci) => {
                  const globalFirst = si === 0 && ci === 0;
                  const globalLast = si === segs.length - 1 && ci === seg.cols.length - 1;
                  return (
                    <div key={ci} className="flex w-[58px] flex-col items-center">
                      <div className="mb-1.5 text-xs font-semibold tabular text-ink">{c.day}</div>
                      <div className="relative flex h-4 w-full items-center justify-center">
                        {/* linha de conexão */}
                        <div
                          className="absolute top-1/2 h-[3px] -translate-y-1/2"
                          style={{
                            background: c.cor,
                            left: globalFirst ? '50%' : 0,
                            right: globalLast ? '50%' : 0,
                          }}
                        />
                        <span className="relative h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ background: c.cor }} />
                      </div>
                      <div className="mt-2 flex h-5 items-center justify-center gap-0.5 text-muted">
                        {c.canais.map((canal, k) => {
                          const Ic = canalLabel[canal]?.icon ?? MessageCircle;
                          return <Ic key={k} size={15} />;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {LEGENDA.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.cor }} /> {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReguasPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [sel, setSel] = useState<Rule | null>(null);
  const [msg, setMsg] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Rule[]>('/reguas').catch(() => []);
    setRules(r);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function salvar() {
    if (!sel) return;
    setMsg('Salvando...');
    // renumera ordem
    const payload = { ...sel, steps: sel.steps.map((s, i) => ({ ...s, ordem: i + 1 })), faixaRisco: sel.faixaRisco || undefined };
    try {
      const saved = sel.id
        ? await api<Rule>(`/reguas/${sel.id}`, { method: 'PUT', body: payload })
        : await api<Rule>('/reguas', { method: 'POST', body: payload });
      setMsg('✓ Régua salva');
      setSel(saved);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function excluir() {
    if (!sel?.id) return setSel(null);
    await api(`/reguas/${sel.id}`, { method: 'DELETE' }).catch(() => {});
    setSel(null);
    load();
  }

  return (
    <div>
      <PageTitle title="Réguas de cobrança" subtitle="Monte o fluxo: quando e por onde falar com o cliente" />

      <NichoGallery onClone={load} />
      <AbStats />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Lista de réguas */}
        <div>
          <button
            onClick={() => setSel(novaRegua())}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <Plus size={16} /> Nova régua
          </button>
          <button
            onClick={() => setAiOpen(true)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary-tint px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white"
          >
            <Sparkles size={16} /> Criar com IA
          </button>
          <div className="space-y-2">
            {rules.map((r) => (
              <button
                key={r.id}
                onClick={() => setSel(r)}
                className={`w-full rounded-lg border px-3 py-3 text-left text-sm ${
                  sel?.id === r.id ? 'border-primary bg-primary-tint' : 'border-line bg-surface hover:bg-canvas'
                }`}
              >
                <div className="font-medium text-ink">{r.nome}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {faixaLabel[r.faixaRisco || '']} · {r.steps.length} passos
                </div>
                <div className="mt-1 text-xs">
                  {r.campaigns && r.campaigns.length > 0
                    ? <span className="text-muted">Usada por <b className="text-ink">{r.campaigns.length}</b> campanha(s): {r.campaigns.map((c) => c.nome).join(', ')}</span>
                    : <span className="text-muted/70">Nenhuma campanha usa esta régua ainda</span>}
                </div>
                <div className="mt-2"><ReguaTimeline steps={r.steps} compact /></div>
              </button>
            ))}
            {rules.length === 0 && <p className="text-sm text-muted">Nenhuma régua ainda.</p>}
          </div>
        </div>

        {/* Editor de fluxo */}
        {sel ? (
          <FlowEditor rule={sel} setRule={setSel} onSave={salvar} onDelete={excluir} msg={msg} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line bg-surface p-12 text-sm text-muted">
            Selecione uma régua ou crie uma nova para montar o fluxo.
          </div>
        )}
      </div>
      {aiOpen && <AiReguaModal onClose={() => setAiOpen(false)} onGerado={(r) => { setAiOpen(false); setSel({ ...novaRegua(), ...r }); }} />}
    </div>
  );
}

function AiReguaModal({ onClose, onGerado }: { onClose: () => void; onGerado: (r: Partial<Rule>) => void }) {
  const [f, setF] = useState({ negocio: '', objetivo: 'recuperar inadimplência', tom: 'amigável', inicioDias: '3', fimDias: '15', toques: '4', desconto: '', acaoFinal: '', empresa: '' });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [canais, setCanais] = useState<string[]>(['WHATSAPP_CLOUD']);
  const toggleCanal = (v: string) => setCanais((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  async function gerar() {
    setBusy(true); setErro('');
    try {
      const r = await api<Partial<Rule>>('/ia/regua', { method: 'POST', body: { ...f, canais, inicioDias: Number(f.inicioDias), fimDias: Number(f.fimDias), toques: Number(f.toques) } });
      onGerado(r);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Sparkles size={18} className="text-primary" /> Criar régua com IA</h2><button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button></div>
        <p className="mb-4 text-sm text-muted">Responda algumas perguntas e a IA monta a régua. Você pode editar tudo depois.</p>
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Qual seu tipo de negócio? *</span><input value={f.negocio} onChange={(e) => set('negocio', e.target.value)} placeholder="Ex.: provedor de internet, academia, escola..." className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Objetivo</span><select value={f.objetivo} onChange={(e) => set('objetivo', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary"><option value="recuperar inadimplência">Recuperar quem atrasou</option><option value="apenas avisar/lembrar">Só avisar/lembrar</option></select></label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Tom</span><select value={f.tom} onChange={(e) => set('tom', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary"><option value="amigável">Amigável</option><option value="neutro">Neutro</option><option value="firme">Firme</option></select></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Dias antes</span><input type="number" value={f.inicioDias} onChange={(e) => set('inicioDias', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Dias depois</span><input type="number" value={f.fimDias} onChange={(e) => set('fimDias', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Nº de mensagens</span><input type="number" value={f.toques} onChange={(e) => set('toques', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          </div>
          <p className="-mt-1 text-xs text-muted">Nº de mensagens = quantas vezes falar com o cliente na sequência (mais mensagens = mais insistência).</p>
          <div><span className="mb-1 block text-xs text-muted">Canais que a IA pode usar</span><div className="flex flex-wrap gap-2">{([['WHATSAPP_CLOUD', 'WhatsApp'], ['SMS', 'SMS'], ['EMAIL', 'E-mail']] as [string, string][]).map(([v, l]) => (<button key={v} type="button" onClick={() => toggleCanal(v)} className={`rounded border px-4 py-1.5 text-sm ${canais.includes(v) ? 'border-primary bg-primary-tint text-primary' : 'border-line hover:bg-canvas'}`}>{l}</button>))}</div></div>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Oferece desconto/acordo? (opcional)</span><input value={f.desconto} onChange={(e) => set('desconto', e.target.value)} placeholder="Ex.: 10% de desconto após 10 dias" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Ação final (opcional)</span><input value={f.acaoFinal} onChange={(e) => set('acaoFinal', e.target.value)} placeholder="Ex.: aviso de bloqueio/suspensão" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Nome da empresa (assinatura)</span><input value={f.empresa} onChange={(e) => set('empresa', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
        </div>
        {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button><button onClick={gerar} disabled={busy || !f.negocio.trim()} className="flex items-center gap-2 rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Gerando...' : <><Sparkles size={15} /> Gerar régua</>}</button></div>
      </div>
    </div>
  );
}

function FlowEditor({
  rule,
  setRule,
  onSave,
  onDelete,
  msg,
}: {
  rule: Rule;
  setRule: (r: Rule) => void;
  onSave: () => void;
  onDelete: () => void;
  msg: string;
}) {
  function update(patch: Partial<Rule>) {
    setRule({ ...rule, ...patch });
  }
  function updateStep(i: number, patch: Partial<Step>) {
    const steps = rule.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    update({ steps });
  }
  function addStep() {
    update({ steps: [...rule.steps, { ordem: rule.steps.length + 1, offsetDias: 0, canal: 'WHATSAPP_CLOUD', template: '' }] });
  }
  function removeStep(i: number) {
    update({ steps: rule.steps.filter((_, idx) => idx !== i) });
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rule.steps.length) return;
    const steps = [...rule.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    update({ steps });
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      {/* Cabeçalho da régua */}
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block md:col-span-1">
          <span className="mb-1 block text-xs text-muted">Nome da régua</span>
          <input value={rule.nome} onChange={(e) => update({ nome: e.target.value })} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Aplicar à faixa de risco</span>
          <select value={rule.faixaRisco || ''} onChange={(e) => update({ faixaRisco: e.target.value as Faixa })} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">Todas as faixas</option>
            <option value="BOM">Bom pagador</option>
            <option value="ATENCAO">Atenção</option>
            <option value="RISCO">Risco</option>
          </select>
        </label>
      </div>

      {/* Janela de envio e anti-spam */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg bg-canvas p-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-muted">Enviar das</span>
          <input type="number" min={0} max={23} value={rule.janelaInicio ?? 9} onChange={(e) => update({ janelaInicio: Number(e.target.value) })} className="w-20 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted">até (h)</span>
          <input type="number" min={0} max={23} value={rule.janelaFim ?? 20} onChange={(e) => update({ janelaFim: Number(e.target.value) })} className="w-20 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted">Máx. msgs/dia</span>
          <input type="number" min={0} value={rule.maxMsgsDia ?? ''} placeholder="sem limite" onChange={(e) => update({ maxMsgsDia: e.target.value ? Number(e.target.value) : null })} className="w-28 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-muted">
          <input type="checkbox" checked={!!rule.diasUteisSomente} onChange={(e) => update({ diasUteisSomente: e.target.checked })} /> Só dias úteis
        </label>
      </div>

      {/* Pré-visualização da linha do tempo */}
      <div className="mb-5 rounded-lg border border-line bg-canvas p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          Linha do tempo da régua
          <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-normal text-primary">{rule.steps.length} passo(s)</span>
        </div>
        <ReguaTimeline steps={rule.steps} />
      </div>

      {/* Timeline de passos */}
      <div className="space-y-3">
        {rule.steps.map((step, i) => (
          <StepCard
            key={i}
            index={i}
            step={step}
            onChange={(p) => updateStep(i, p)}
            onRemove={() => removeStep(i)}
            onMove={(d) => move(i, d)}
            isFirst={i === 0}
            isLast={i === rule.steps.length - 1}
          />
        ))}
      </div>

      <button onClick={addStep} className="mt-3 flex items-center gap-2 rounded border border-dashed border-line px-3 py-2 text-sm text-primary hover:bg-canvas">
        <Plus size={16} /> Adicionar passo
      </button>

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <button onClick={onSave} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          <Save size={16} /> Salvar régua
        </button>
        <button onClick={onDelete} className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm text-danger hover:bg-danger-tint">
          <Trash2 size={16} /> Excluir
        </button>
        {msg && <span className="text-sm text-primary">{msg}</span>}
      </div>

      <p className="mt-3 text-xs text-muted">
        Variáveis: <code className="text-primary">{'{{nome}} {{valor}} {{vencimento}} {{pix}} {{link}} {{contrato}}'}</code>
      </p>
    </div>
  );
}

function AiMensagemBtn({ texto, onResult }: { texto: string; onResult: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opts: [string, string][] = [
    ['Melhorar', 'melhore a mensagem mantendo o sentido'],
    ['Mais amigável', 'deixe mais amigável e acolhedora'],
    ['Mais firme', 'deixe mais firme e direta, sem ser rude'],
    ['Encurtar', 'encurte ao máximo mantendo o essencial'],
  ];
  async function run(instrucao: string) {
    setOpen(false); setBusy(true);
    try { const r = await api<{ texto: string }>('/ia/mensagem', { method: 'POST', body: { texto, instrucao } }); if (r.texto) onResult(r.texto); } catch { /* ignora */ }
    setBusy(false);
  }
  return (
    <span className="relative ml-auto inline-block font-normal">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy} className="flex items-center gap-1 rounded bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-60"><Sparkles size={12} /> {busy ? '...' : 'IA'}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            {opts.map(([l, ins]) => <button key={l} type="button" onClick={() => run(ins)} className="block w-full px-3 py-2 text-left text-xs hover:bg-canvas">{l}</button>)}
          </div>
        </>
      )}
    </span>
  );
}

function StepCard({
  index,
  step,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  index: number;
  step: Step;
  onChange: (p: Partial<Step>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  // modo do offset (antes / no dia / depois) e dias como estado local independente,
  // para digitar 0 não trocar automaticamente a direção.
  const [mode, setMode] = useState<'antes' | 'dia' | 'depois'>(
    step.offsetDias < 0 ? 'antes' : step.offsetDias > 0 ? 'depois' : 'dia',
  );
  const [dias, setDias] = useState<string>(String(Math.abs(step.offsetDias)));

  function aplicar(m: 'antes' | 'dia' | 'depois', d: string) {
    const n = Math.max(0, Number(d) || 0);
    onChange({ offsetDias: m === 'antes' ? -n : m === 'depois' ? n : 0 });
  }
  function onModeChange(m: 'antes' | 'dia' | 'depois') {
    setMode(m);
    if (m === 'dia') setDias('0');
    aplicar(m, m === 'dia' ? '0' : dias);
  }
  function onDiasChange(v: string) {
    setDias(v);
    aplicar(mode, v);
  }

  // Conexões (canais) conectadas do tenant
  const [canais, setCanais] = useState<{ id: string; canal: string; apelido: string; status: string; oficial?: boolean; origem?: string }[]>([]);
  useEffect(() => { api<{ id: string; canal: string; apelido: string; status: string; oficial?: boolean; origem?: string }[]>('/canais').then(setCanais).catch(() => setCanais([])); }, []);
  // Exclui a conexão-base do NX (URL+token) — não é canal de envio; usa-se os canais importados.
  const conectados = canais.filter((c) => c.status !== 'DESCONECTADO' && !(c.canal === 'NX_SYSTEMS' && c.origem !== 'nx'));
  const canalSelId = step.channelAccountId || conectados.find((c) => c.canal === step.canal)?.id || '';
  const conn = conectados.find((c) => c.id === canalSelId);

  // Templates aprovados (API oficial do WhatsApp)
  const [templates, setTemplates] = useState<{ id: string; nome: string; corpo: string; status: string }[]>([]);
  async function sincronizarTemplates() {
    setTemplates(await api<{ id: string; nome: string; corpo: string; status: string }[]>('/config/templates').catch(() => []));
  }

  // Modelos de e-mail salvos — atalho para preencher assunto + corpo do passo.
  const [modelosEmail, setModelosEmail] = useState<{ id: string; nome: string; assunto: string; corpo: string }[]>([]);
  useEffect(() => {
    if (step.canal !== 'EMAIL') return;
    api<{ id: string; nome: string; assunto: string; corpo: string }[]>('/modelos-email').then(setModelosEmail).catch(() => setModelosEmail([]));
  }, [step.canal]);
  // WhatsApp → só template (texto livre não é entregue). SMS/e-mail → só texto livre.
  const canalOficial = ehWhatsApp(step.canal);
  useEffect(() => { if (canalOficial) sincronizarTemplates(); }, [canalOficial]);

  // Template selecionado + mapa de variáveis (fonte única = o próprio passo).
  const temTemplate = !!step.templateName;
  const corpoTpl = step.template; // guarda o corpo aprovado com {{1}}, {{2}}...
  const nVars = temTemplate ? maxVarPos(corpoTpl) : 0;
  const params = step.templateParams ?? [];
  const previewTexto = temTemplate ? aplicarMapa(corpoTpl, params) : step.template;

  function selecionarTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const n = maxVarPos(t.corpo);
    const inicial = Array.from({ length: n }, (_, i) => (i === 0 ? '{{nome}}' : ''));
    onChange({ templateName: t.nome, template: t.corpo, templateParams: inicial });
  }
  function setPos(i: number, token: string) {
    const novo = Array.from({ length: nVars }, (_, idx) => (idx === i ? token : params[idx] || ''));
    onChange({ templateParams: novo });
  }
  function limparTemplate() { onChange({ templateName: undefined, templateParams: [] }); }

  const Icon = canalLabel[step.canal]?.icon ?? MessageCircle;

  return (
    <div className="relative rounded-lg border border-line bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-white">{index + 1}</span>
        <div className="flex gap-1">
          <button onClick={() => onMove(-1)} disabled={isFirst} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowUp size={15} /></button>
          <button onClick={() => onMove(1)} disabled={isLast} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowDown size={15} /></button>
          <button onClick={onRemove} className="rounded p-1 text-danger hover:bg-danger-tint"><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Quando</span>
          <select value={mode} onChange={(e) => onModeChange(e.target.value as 'antes' | 'dia' | 'depois')} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="antes">Antes do vencimento</option>
            <option value="dia">No dia do vencimento</option>
            <option value="depois">Depois do vencimento</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Dias</span>
          <input
            type="number"
            min={0}
            max={90}
            value={mode === 'dia' ? '0' : dias}
            disabled={mode === 'dia'}
            onChange={(e) => onDiasChange(e.target.value)}
            className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-line/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Enviar por (canal conectado)</span>
          <select
            value={canalSelId}
            onChange={(e) => { const c = conectados.find((x) => x.id === e.target.value); if (c) onChange({ channelAccountId: c.id, canal: c.canal as Canal }); }}
            className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {conectados.length === 0 && <option value="">Nenhum canal conectado</option>}
            {conectados.map((c) => <option key={c.id} value={c.id}>{c.apelido} · {canalLabel[c.canal as Canal]?.label || c.canal}</option>)}
          </select>
          {conectados.length === 0 && <Link href="/canais" className="mt-1 block text-xs text-primary underline">Conectar um canal</Link>}
        </label>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <span>Fallback:</span>
          <select
            value={(step.canaisFallback && step.canaisFallback[0]) || ''}
            onChange={(e) => onChange({ canaisFallback: e.target.value ? [e.target.value as Canal] : [] })}
            className="rounded border border-line px-2 py-1 outline-none focus:border-primary"
          >
            <option value="">nenhum</option>
            {/* Só canais conectados, como o seletor principal — não todos os tipos possíveis. */}
            {[...new Set(conectados.map((c) => c.canal))].filter((k) => k !== step.canal).map((k) => <option key={k} value={k}>{canalLabel[k as Canal]?.label || k}</option>)}
          </select>
        </label>
        {!canalOficial && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!step.abTest} onChange={(e) => onChange({ abTest: e.target.checked })} /> A/B testing
          </label>
        )}
      </div>

      {canalOficial && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary-tint/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-primary">Template aprovado (API oficial exige template pré-aprovado pela Meta)</span>
            <button onClick={sincronizarTemplates} type="button" className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-surface"><RefreshCw size={12} /> Sincronizar</button>
          </div>
          <select
            value=""
            onChange={(e) => selecionarTemplate(e.target.value)}
            className="w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Selecionar template...</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.status !== 'APROVADO' ? ` (${t.status})` : ''}</option>)}
          </select>
          {templates.length === 0 && <p className="mt-1 text-xs text-muted">Nenhum template ainda. Sincronize em <Link href="/templates" className="text-primary underline">Templates WhatsApp</Link>.</p>}

          {/* Mapeamento: variável posicional do template -> variável da Recorrai */}
          {temTemplate && (
            <div className="mt-3 rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">Template: {step.templateName}</span>
                <button onClick={limparTemplate} type="button" className="text-xs text-muted hover:text-danger">Limpar</button>
              </div>
              {nVars === 0 ? (
                <p className="text-xs text-muted">Este template não tem variáveis.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted">Escolha qual dado da Recorrai entra em cada variável do template:</p>
                  <div className="space-y-2">
                    {Array.from({ length: nVars }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-11 shrink-0 rounded bg-primary-tint px-2 py-1 text-center text-xs font-semibold text-primary">{`{{${i + 1}}}`}</span>
                        <span className="text-muted">→</span>
                        <select value={params[i] || ''} onChange={(e) => setPos(i, e.target.value)} className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-primary">
                          <option value="">Selecione a variável...</option>
                          {RECORRA_VARS.map((v) => <option key={v.token} value={v.token}>{v.label} · {v.token}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {canalOficial ? (
        /* Canal oficial: a mensagem vem do template aprovado — sem texto livre. */
        <div className="mt-2">
          <span className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Icon size={14} /> Mensagem <span className="rounded-full bg-primary-tint px-1.5 py-0.5 text-[10px] font-medium text-primary">via template</span>{temTemplate && <span className="ml-auto"><PreviewButton canal={step.canal} texto={previewTexto} /></span>}</span>
          {temTemplate
            ? <div className="whitespace-pre-wrap rounded border border-line bg-canvas p-3 text-sm text-muted">{previewTexto}</div>
            : <div className="rounded border border-dashed border-line p-3 text-sm text-muted">Selecione um template aprovado acima. Canais oficiais só enviam via template pré-aprovado pela Meta.</div>}
        </div>
      ) : (
        /* SMS/e-mail: texto livre — não têm template. */
        <>
          {step.canal === 'EMAIL' && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-surface px-3 py-2">
                <span className="text-xs text-muted">Começar de um modelo:</span>
                <select
                  value=""
                  onChange={(e) => {
                    const m = modelosEmail.find((x) => x.id === e.target.value);
                    if (m) onChange({ emailAssunto: m.assunto, template: m.corpo });
                  }}
                  className="rounded border border-line px-2 py-1 text-sm outline-none focus:border-primary"
                >
                  <option value="">{modelosEmail.length ? 'Escolher modelo...' : 'Nenhum modelo salvo'}</option>
                  {modelosEmail.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <Link href="/modelos-email" className="text-xs font-medium text-primary hover:underline">Gerenciar modelos</Link>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Assunto do e-mail</span>
                <input
                  value={step.emailAssunto ?? ''}
                  onChange={(e) => onChange({ emailAssunto: e.target.value })}
                  placeholder="Ex.: {{nome}}, sua fatura vence em {{vencimento}}"
                  className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <span className="mt-1 block text-xs text-muted">Sem assunto, o e-mail sai como &quot;Aviso de cobrança&quot;.</span>
              </label>
            </div>
          )}
          <label className="mt-2 block">
            <span className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Icon size={14} /> Mensagem {step.abTest ? '(variante A)' : ''}<PreviewButton canal={step.canal} texto={step.template} assunto={step.emailAssunto} /><AiMensagemBtn texto={step.template} onResult={(t) => onChange({ template: t })} /></span>
            <textarea
              value={step.template}
              onChange={(e) => onChange({ template: e.target.value })}
              rows={2}
              placeholder="Olá {{nome}}, ..."
              className="w-full rounded border border-line p-3 text-sm outline-none focus:border-primary"
            />
          </label>
          {step.abTest && (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs text-muted">Mensagem (variante B)</span>
              <textarea
                value={step.templateB ?? ''}
                onChange={(e) => onChange({ templateB: e.target.value })}
                rows={2}
                placeholder="Versão alternativa da mensagem..."
                className="w-full rounded border border-line p-3 text-sm outline-none focus:border-primary"
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}

interface Modelo { id: string; nicho: string; nome: string; faixaRisco: string | null; passos: number }

function NichoGallery({ onClone }: { onClone: () => void }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api<Modelo[]>('/reguas/modelos').then(setModelos).catch(() => {}); }, []);

  async function clonar(id: string) {
    setMsg('Clonando...');
    await api(`/reguas/modelos/${id}/clonar`, { method: 'POST' }).catch(() => {});
    setMsg('✓ Régua criada a partir do modelo');
    onClone();
  }

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4">
      <button onClick={() => setAberto((a) => !a)} className="text-sm font-medium text-primary">
        {aberto ? '− ' : '+ '} Réguas-modelo por nicho
      </button>
      {aberto && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {modelos.map((m) => (
            <div key={m.id} className="rounded-lg border border-line p-3">
              <div className="text-sm font-medium text-ink">{m.nome}</div>
              <div className="mb-2 text-xs text-muted">{m.nicho} · {m.passos} passos{m.faixaRisco ? ` · faixa ${m.faixaRisco}` : ''}</div>
              <button onClick={() => clonar(m.id)} className="rounded border border-line px-3 py-1 text-xs hover:bg-canvas">Usar este modelo</button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
    </div>
  );
}

interface AbResult { resultados: { variante: string; enviados: number; pagos: number; taxa: number }[]; vencedora: string | null }

function AbStats() {
  const [ab, setAb] = useState<AbResult | null>(null);
  useEffect(() => { api<AbResult>('/reguas/ab/stats').then(setAb).catch(() => {}); }, []);
  if (!ab || ab.resultados.every((r) => r.enviados === 0)) return null;
  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 text-sm font-medium text-ink">A/B testing {ab.vencedora ? `· vencedora: ${ab.vencedora}` : '· coletando dados'}</div>
      <div className="flex gap-6">
        {ab.resultados.map((r) => (
          <div key={r.variante} className="text-sm">
            <span className="font-medium">Variante {r.variante}</span>
            <span className="ml-2 text-muted">{r.enviados} envios · {Math.round(r.taxa * 100)}% pagamento</span>
          </div>
        ))}
      </div>
    </div>
  );
}
