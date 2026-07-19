'use client';

import { useEffect, useState } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';

interface PlanInfo {
  plano: { nome: string; preco: number; sobConsulta?: boolean; maxClientes: number; disparosInclusos: number; maxUsuarios: number };
  uso: { clientes: number; disparos: number; usuarios: number };
  fatura: { base: number; disparosExcedentes: number; valorExcedente: number; total: number };
  limites: { clientesOk: boolean; usuariosOk: boolean; avisos: string[] };
  features: Record<string, boolean>;
}

const featLabel: Record<string, string> = {
  cobranca: 'Geração de cobrança',
  ia_risco: 'Score de risco (IA)',
  reguas_por_risco: 'Réguas por faixa de risco',
  ia_completa: 'IA completa (ML + chatbot)',
  multi_gateway: 'Múltiplos gateways',
  api_ingestao: 'Ingestão via API',
};

function Bar({ label, atual, limite }: { label: string; atual: number; limite: number }) {
  const pct = limite > 0 ? Math.min(100, Math.round((atual / limite) * 100)) : 0;
  const cor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F0A93B' : '#14857C';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span className="tabular">{atual}{limite > 0 ? ` / ${limite}` : ''}</span></div>
      <div className="h-2 rounded-full bg-canvas"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: cor }} /></div>
    </div>
  );
}

export default function PlanoPage() {
  const [info, setInfo] = useState<PlanInfo | null>(null);

  useEffect(() => { api<PlanInfo>('/minha-conta/plano').then(setInfo).catch(() => {}); }, []);
  if (!info) return <div><PageTitle title="Plano e uso" /><p className="text-sm text-muted">Carregando...</p></div>;

  return (
    <div>
      <PageTitle title="Plano e uso" subtitle={`Plano atual: ${info.plano.nome} · ${info.plano.sobConsulta ? 'sob consulta' : `${brl(info.plano.preco)}/mês`}`} />

      {info.limites.avisos.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning-tint p-4">
          {info.limites.avisos.map((a, i) => (
            <p key={i} className="flex items-center gap-2 text-sm text-[#854F0B]"><AlertTriangle size={15} /> {a}</p>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="Mensalidade base" value={brl(info.fatura.base)} />
        <Metric label="Excedente de disparos" value={brl(info.fatura.valorExcedente)} accent={info.fatura.valorExcedente > 0 ? '#F0A93B' : undefined} />
        <Metric label="Fatura estimada do mês" value={brl(info.fatura.total)} accent="#14857C" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Consumo do mês</h2>
          <Bar label="Clientes" atual={info.uso.clientes} limite={info.plano.maxClientes} />
          <Bar label="Disparos" atual={info.uso.disparos} limite={info.plano.disparosInclusos} />
          <Bar label="Usuários" atual={info.uso.usuarios} limite={info.plano.maxUsuarios} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">Recursos do plano</h2>
          <div className="space-y-2">
            {Object.entries(featLabel).map(([k, label]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                {info.features[k] ? <Check size={16} className="text-success" /> : <X size={16} className="text-muted" />}
                <span className={info.features[k] ? 'text-ink' : 'text-muted'}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
