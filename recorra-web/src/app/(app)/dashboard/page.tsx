'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';

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

function SerieChart({ serie }: { serie: SerieMes[] }) {
  if (!serie.length) return null;
  const w = 560, h = 200, pad = 32;
  const max = Math.max(1, ...serie.flatMap((s) => [s.previsto, s.recebido]));
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, serie.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const linha = (key: 'previsto' | 'recebido') => serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(s[key])}`).join(' ');
  const area = `${linha('recebido')} L ${x(serie.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z`;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Cobranças previstas x recebidas (6 meses)</h2>
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Recebidas</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#7C3AED' }} /> Previstas</span>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full min-w-[420px]">
          <path d={area} fill="#14857C" opacity={0.08} />
          <path d={linha('previsto')} fill="none" stroke="#7C3AED" strokeWidth={2} strokeDasharray="4 4" />
          <path d={linha('recebido')} fill="none" stroke="#14857C" strokeWidth={2.5} />
          {serie.map((s, i) => (
            <g key={s.mes}>
              <circle cx={x(i)} cy={y(s.recebido)} r={3.5} fill="#14857C" />
              <text x={x(i)} y={h - pad + 16} textAnchor="middle" className="fill-muted text-[10px]">{s.label}</text>
            </g>
          ))}
        </svg>
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
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<Resumo>('/dashboard/resumo').then(setData).catch((e) => setErro(e.message));
    api<Aging>('/dashboard/aging').then(setAging).catch(() => {});
    api<SerieMes[]>('/dashboard/serie-mensal').then(setSerie).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Dashboard" subtitle="Resumo de inadimplência e recuperação do mês" />
        <Link href="/ajuda" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          <HelpCircle size={16} /> Central de Ajuda
        </Link>
      </div>

      <OnboardingCard />
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Inadimplência" value={brl(data.inadimplencia.valor)} accent="#EF4444" />
            <Metric label="Recuperado no mês" value={brl(data.recuperadoMes.valor)} accent="#0F6E56" />
            <Metric label="Taxa de recuperação" value={`${data.taxaRecuperacao}%`} accent="#14857C" />
            <Metric label="Disparos no mês" value={data.disparosMes.toLocaleString('pt-BR')} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Cobranças ativas" value={data.cobrancasAtivas.toLocaleString('pt-BR')} />
            <Metric label="Faturas vencidas" value={data.inadimplencia.faturas.toLocaleString('pt-BR')} />
            <Metric label="Faturas pagas (mês)" value={data.recuperadoMes.faturas.toLocaleString('pt-BR')} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AgingCard titulo="Contas a receber em aberto" grupo={aging?.emAberto} cor="#14857C" />
            <AgingCard titulo="Contas a receber vencidas" grupo={aging?.vencidas} cor="#EF4444" />
          </div>

          <div className="mt-4">
            <SerieChart serie={serie} />
          </div>
        </>
      )}
      {!data && !erro && <p className="text-sm text-muted">Carregando...</p>}
    </div>
  );
}
