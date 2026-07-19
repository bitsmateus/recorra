'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Check, Circle, HelpCircle, Filter, X, MessageCircle, Mail, Smartphone, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';
import { PERIODOS, PeriodoChave, intervaloDe, rotuloPeriodo } from '@/lib/periodo';

interface Resumo {
  inadimplencia: { valor: number; faturas: number };
  recuperadoMes: { valor: number; faturas: number };
  cobrancasAtivas: number;
  disparosMes: number;
  taxaRecuperacao: number;
}
interface Onboarding {
  concluido: boolean;
  progresso: number;
  total: number;
  passos: { chave: string; titulo: string; feito: boolean }[];
}
interface AgingLinha { periodo: string; clientes: number; faturas: number; valor: number; pct: number }
interface AgingGrupo { total: AgingLinha; linhas: AgingLinha[] }
interface Aging { emAberto: AgingGrupo; vencidas: AgingGrupo }
interface SerieMes { mes: string; label: string; previsto: number; recebido: number }
interface CanalLinha {
  canal: string; label: string; disparos: number; enviados: number; entregues: number; lidos: number;
  falhas: number; fila: number; ignorados: number; custo: number; taxaEntrega: number; taxaFalha: number; pct: number;
}
interface Canais {
  total: { disparos: number; enviados: number; entregues: number; lidos: number; falhas: number; fila: number; ignorados: number; custo: number; taxaEntrega: number };
  canais: CanalLinha[];
}

const canalIcon: Record<string, typeof MessageCircle> = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Smartphone };
const num = (n: number) => n.toLocaleString('pt-BR');

function FiltroPeriodo({
  periodo, de, ate, onPeriodo, onData, onLimpar,
}: {
  periodo: PeriodoChave; de: string; ate: string;
  onPeriodo: (p: PeriodoChave) => void;
  onData: (k: 'de' | 'ate', v: string) => void;
  onLimpar: () => void;
}) {
  return (
    <div className="mb-6 rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <Filter size={14} /> Período
        {periodo !== 'mes' && (
          <button onClick={onLimpar} className="ml-auto flex items-center gap-1 rounded-md border border-danger/40 bg-danger-tint px-3 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-white">
            <X size={13} /> Limpar
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.chave}
            onClick={() => onPeriodo(p.chave)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              periodo === p.chave ? 'border-primary bg-primary text-white' : 'border-line text-muted hover:border-primary hover:text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
        {periodo === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" title="De" value={de} onChange={(e) => onData('de', e.target.value)} className="rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-primary" />
            <span className="text-xs text-muted">até</span>
            <input type="date" title="Até" value={ate} onChange={(e) => onData('ate', e.target.value)} className="rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

function AgingCard({ titulo, grupo, cor }: { titulo: string; grupo?: AgingGrupo; cor: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-ink">{titulo}</h2>
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-muted">
            <tr><th className="py-2 font-medium">Período</th><th className="py-2 text-right font-medium">Clientes</th><th className="py-2 text-right font-medium">Faturas</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">%</th></tr>
          </thead>
          <tbody>
            {grupo && (
              <tr className="border-b border-line font-medium">
                <td className="py-2">Total</td>
                <td className="tabular py-2 text-right">{grupo.total.clientes}</td>
                <td className="tabular py-2 text-right">{grupo.total.faturas}</td>
                <td className="tabular py-2 text-right" style={{ color: cor }}>{brl(grupo.total.valor)}</td>
                <td className="tabular py-2 text-right text-muted">100%</td>
              </tr>
            )}
            {grupo?.linhas.map((l) => (
              <tr key={l.periodo} className="border-b border-line last:border-0">
                <td className="py-2 text-muted">{l.periodo}</td>
                <td className="tabular py-2 text-right">{l.clientes}</td>
                <td className="tabular py-2 text-right">{l.faturas}</td>
                <td className="tabular py-2 text-right" style={{ color: cor }}>{brl(l.valor)}</td>
                <td className="tabular py-2 text-right text-muted">{l.pct}%</td>
              </tr>
            ))}
            {!grupo && <tr><td colSpan={5} className="py-6 text-center text-muted">Carregando...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Barra empilhada de um canal: entregues / enviados sem confirmação / falhas / fila. */
function BarraCanal({ c }: { c: CanalLinha }) {
  const partes = [
    { n: c.entregues, cor: '#14857C', nome: 'entregues' },
    { n: c.enviados - c.entregues, cor: '#7CC5BE', nome: 'enviados' },
    { n: c.falhas, cor: '#EF4444', nome: 'falhas' },
    { n: c.fila, cor: '#F0A93B', nome: 'na fila' },
    { n: c.ignorados, cor: '#CBD5E1', nome: 'ignorados' },
  ].filter((p) => p.n > 0);

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-canvas">
      {partes.map((p) => (
        <div key={p.nome} title={`${num(p.n)} ${p.nome}`} style={{ width: `${(p.n / Math.max(1, c.disparos)) * 100}%`, background: p.cor }} />
      ))}
    </div>
  );
}

function CanaisCard({ dados, rotulo }: { dados: Canais | null; rotulo: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <Send size={15} className="text-primary" />
        <h2 className="text-sm font-medium text-ink">Disparos por canal</h2>
        <Link href="/disparos" className="ml-auto text-xs font-medium text-primary hover:underline">Ver histórico</Link>
      </div>
      <p className="mb-4 text-xs text-muted">Volume e entrega · {rotulo}</p>

      {/* O card só monta depois que o resumo chega, e as duas chamadas resolvem
          juntas — então `dados` nulo aqui é falha, não carregamento. */}
      {!dados && <p className="py-6 text-center text-sm text-muted">Não foi possível carregar os disparos.</p>}
      {dados && dados.canais.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum disparo neste período.</p>}

      {dados && dados.canais.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-xs">
            <span className="text-muted">Total <strong className="tabular ml-1 text-sm text-ink">{num(dados.total.disparos)}</strong></span>
            <span className="text-muted">Entregues <strong className="tabular ml-1 text-sm text-primary">{num(dados.total.entregues)}</strong></span>
            <span className="text-muted">Falhas <strong className={`tabular ml-1 text-sm ${dados.total.falhas > 0 ? 'text-danger' : 'text-ink'}`}>{num(dados.total.falhas)}</strong></span>
            <span className="text-muted">Na fila <strong className="tabular ml-1 text-sm text-ink">{num(dados.total.fila)}</strong></span>
            <span className="text-muted">Taxa de entrega <strong className="tabular ml-1 text-sm text-ink">{dados.total.taxaEntrega}%</strong></span>
            {dados.total.custo > 0 && <span className="text-muted">Custo <strong className="tabular ml-1 text-sm text-ink">{brl(dados.total.custo)}</strong></span>}
          </div>

          <div className="space-y-4">
            {dados.canais.map((c) => {
              const Icon = canalIcon[c.canal] || Send;
              return (
                <div key={c.canal}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <Icon size={14} className="text-muted" />
                    <span className="font-medium text-ink">{c.label}</span>
                    <span className="text-xs text-muted">{c.pct}% do volume</span>
                    <span className="tabular ml-auto font-medium text-ink">{num(c.disparos)}</span>
                  </div>
                  <BarraCanal c={c} />
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
                    <span>{num(c.entregues)} entregues · <strong className="text-ink">{c.taxaEntrega}%</strong></span>
                    {c.lidos > 0 && <span>{num(c.lidos)} lidos</span>}
                    {c.falhas > 0 && <span className="text-danger">{num(c.falhas)} falhas · {c.taxaFalha}%</span>}
                    {c.fila > 0 && <span>{num(c.fila)} na fila</span>}
                    {c.custo > 0 && <span>{brl(c.custo)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-[10px] text-muted">
            {[['#14857C', 'Entregues'], ['#7CC5BE', 'Enviados'], ['#EF4444', 'Falhas'], ['#F0A93B', 'Na fila'], ['#CBD5E1', 'Ignorados']].map(([cor, nome]) => (
              <span key={nome} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cor }} /> {nome}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SerieChart({ serie, meses, onMeses }: { serie: SerieMes[]; meses: number; onMeses: (n: number) => void }) {
  const w = 560, h = 200, pad = 32;
  const max = Math.max(1, ...serie.flatMap((s) => [s.previsto, s.recebido]));
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, serie.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const linha = (key: 'previsto' | 'recebido') => serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(s[key])}`).join(' ');
  const area = serie.length ? `${linha('recebido')} L ${x(serie.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z` : '';
  // Com 12+ meses os rótulos se encavalam; mostra um sim, um não.
  const passo = serie.length > 8 ? 2 : 1;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">Cobranças previstas x recebidas</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Recebidas</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#7C3AED' }} /> Previstas</span>
          </div>
          <div className="flex overflow-hidden rounded-md border border-line">
            {[6, 12, 24].map((n) => (
              <button
                key={n}
                onClick={() => onMeses(n)}
                className={`px-2.5 py-1 text-xs font-medium ${meses === n ? 'bg-primary text-white' : 'text-muted hover:bg-canvas'}`}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        {serie.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">Carregando...</p>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full min-w-[420px]">
            <path d={area} fill="#14857C" opacity={0.08} />
            <path d={linha('previsto')} fill="none" stroke="#7C3AED" strokeWidth={2} strokeDasharray="4 4" />
            <path d={linha('recebido')} fill="none" stroke="#14857C" strokeWidth={2.5} />
            {serie.map((s, i) => (
              <g key={s.mes}>
                <title>{`${s.label}: ${brl(s.recebido)} recebido de ${brl(s.previsto)} previsto`}</title>
                <circle cx={x(i)} cy={y(s.recebido)} r={serie.length > 12 ? 2 : 3.5} fill="#14857C" />
                {i % passo === 0 && <text x={x(i)} y={h - pad + 16} textAnchor="middle" className="fill-muted text-[10px]">{s.label}</text>}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

function OnboardingCard() {
  const [ob, setOb] = useState<Onboarding | null>(null);
  useEffect(() => { api<Onboarding>('/onboarding/status').then(setOb).catch(() => {}); }, []);
  if (!ob || ob.concluido) return null;
  return (
    <div className="mb-6 rounded-lg border border-primary/30 bg-primary-tint p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">Primeiros passos ({ob.progresso}/{ob.total})</h2>
        <Link href="/ajuda" className="text-xs font-medium text-primary underline">Ver tutoriais</Link>
      </div>
      <div className="space-y-2">
        {ob.passos.map((p) => (
          <div key={p.chave} className="flex items-center gap-2 text-sm">
            {p.feito ? <Check size={16} className="text-success" /> : <Circle size={16} className="text-muted" />}
            <span className={p.feito ? 'text-muted line-through' : 'text-ink'}>{p.titulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Resumo | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [serie, setSerie] = useState<SerieMes[]>([]);
  const [canais, setCanais] = useState<Canais | null>(null);
  const [erro, setErro] = useState('');

  const [periodo, setPeriodo] = useState<PeriodoChave>('mes');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [meses, setMeses] = useState(6);

  // Presets resolvem para um intervalo concreto; em "Personalizado" valem os
  // campos de data. Sem isso a query mudaria de identidade a cada render.
  const query = useMemo(() => {
    const r = periodo === 'custom' ? { de, ate } : intervaloDe(periodo)!;
    const params = new URLSearchParams();
    if (r.de) params.set('de', r.de);
    if (r.ate) params.set('ate', r.ate);
    return params.toString();
  }, [periodo, de, ate]);

  const rotulo = useMemo(() => rotuloPeriodo(periodo, de, ate), [periodo, de, ate]);

  // Trocar de período dispara uma carga nova sem cancelar a anterior. Se a
  // resposta antiga chegar por último, ela sobrescreveria a nova e a tela
  // mostraria números de um período com o filtro marcando outro.
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const id = ++pedido.current;
    const qs = query ? `?${query}` : '';
    setErro('');
    const [resumo, canaisResp, agingResp] = await Promise.all([
      api<Resumo>(`/dashboard/resumo${qs}`).catch((e: Error) => { if (id === pedido.current) setErro(e.message); return null; }),
      api<Canais>(`/dashboard/disparos-canais${qs}`).catch(() => null),
      api<Aging>(`/dashboard/aging${qs}`).catch(() => null),
    ]);
    if (id !== pedido.current) return;
    setData(resumo);
    setCanais(canaisResp);
    setAging(agingResp);
  }, [query]);

  useEffect(() => { carregar(); }, [carregar]);
  // Mesma corrida do `pedido`: alternar 24m -> 6m depressa pode deixar a
  // resposta longa chegar por último e desenhar 24 pontos com o 6m marcado.
  useEffect(() => {
    let vivo = true;
    api<SerieMes[]>(`/dashboard/serie-mensal?meses=${meses}`).then((s) => { if (vivo) setSerie(s); }).catch(() => {});
    return () => { vivo = false; };
  }, [meses]);

  const limpar = () => { setPeriodo('mes'); setDe(''); setAte(''); };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Dashboard" subtitle={`Resumo de inadimplência e recuperação · ${rotulo}`} />
        <Link href="/ajuda" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          <HelpCircle size={16} /> Central de Ajuda
        </Link>
      </div>

      <OnboardingCard />

      <FiltroPeriodo
        periodo={periodo} de={de} ate={ate}
        onPeriodo={setPeriodo}
        onData={(k, v) => (k === 'de' ? setDe(v) : setAte(v))}
        onLimpar={limpar}
      />

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Inadimplência" value={brl(data.inadimplencia.valor)} accent="#EF4444" />
            <Metric label="Recuperado no período" value={brl(data.recuperadoMes.valor)} accent="#0F6E56" />
            <Metric label="Taxa de recuperação" value={`${data.taxaRecuperacao}%`} accent="#14857C" />
            <Metric label="Disparos no período" value={num(data.disparosMes)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Cobranças ativas" value={num(data.cobrancasAtivas)} />
            <Metric label="Faturas vencidas" value={num(data.inadimplencia.faturas)} />
            <Metric label="Faturas pagas no período" value={num(data.recuperadoMes.faturas)} />
            <Metric label="Taxa de entrega" value={canais ? `${canais.total.taxaEntrega}%` : '—'} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AgingCard titulo="Contas a receber em aberto" grupo={aging?.emAberto} cor="#14857C" />
            <AgingCard titulo="Contas a receber vencidas" grupo={aging?.vencidas} cor="#EF4444" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CanaisCard dados={canais} rotulo={rotulo} />
            <SerieChart serie={serie} meses={meses} onMeses={setMeses} />
          </div>
        </>
      )}
      {!data && !erro && <p className="text-sm text-muted">Carregando...</p>}
    </div>
  );
}
