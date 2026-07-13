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
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<Resumo>('/dashboard/resumo').then(setData).catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
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
            <Metric label="Taxa de recuperação" value={`${data.taxaRecuperacao}%`} accent="#0E7C7B" />
            <Metric label="Disparos no mês" value={data.disparosMes.toLocaleString('pt-BR')} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Cobranças ativas" value={data.cobrancasAtivas.toLocaleString('pt-BR')} />
            <Metric label="Faturas vencidas" value={data.inadimplencia.faturas.toLocaleString('pt-BR')} />
            <Metric label="Faturas pagas (mês)" value={data.recuperadoMes.faturas.toLocaleString('pt-BR')} />
          </div>
        </>
      )}
      {!data && !erro && <p className="text-sm text-muted">Carregando...</p>}
    </div>
  );
}
