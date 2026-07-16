'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';

interface Bucket { chave: string; enviados: number; pagos: number; taxa: number }
interface Funnel { porCanal: Bucket[]; porPasso: Bucket[] }
interface Roi { custo: number; recuperado: number; lucro: number; retornoPorReal: number }
interface Extrato { gateway: string; cobrado: number; pago: number; pendente: number; vencido: number; repassado: number }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function RelatoriosPage() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [roi, setRoi] = useState<Roi | null>(null);
  const [extrato, setExtrato] = useState<Extrato[]>([]);

  useEffect(() => {
    api<Funnel>('/relatorios/funil').then(setFunnel).catch(() => {});
    api<Roi>('/relatorios/roi').then(setRoi).catch(() => {});
    api<Extrato[]>('/relatorios/extrato').then(setExtrato).catch(() => {});
  }, []);

  async function exportar() {
    const res = await fetch(`${API_URL}/relatorios/export/faturas.csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'faturas.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageTitle title="Relatórios" subtitle="Funil de recuperação, ROI da comunicação e extrato por gateway" />

      {roi && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Custo de comunicação (mês)" value={brl(roi.custo)} accent="#EF4444" />
          <Metric label="Recuperado (mês)" value={brl(roi.recuperado)} accent="#0F6E56" />
          <Metric label="Lucro" value={brl(roi.lucro)} accent="#14857C" />
          <Metric label="Retorno por R$1" value={`${roi.retornoPorReal}x`} accent="#14857C" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FunnelTable title="Funil por canal" buckets={funnel?.porCanal} />
        <FunnelTable title="Funil por passo (dias vs. vencimento)" buckets={funnel?.porPasso} />
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Extrato por gateway</h2>
          <button onClick={exportar} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><Download size={14} /> Exportar faturas (CSV)</button>
        </div>
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-muted">
            <tr><th className="py-2 font-medium">Gateway</th><th className="py-2 font-medium">Cobrado</th><th className="py-2 font-medium">Pago</th><th className="py-2 font-medium">Vencido</th><th className="py-2 font-medium">Repassado</th></tr>
          </thead>
          <tbody>
            {extrato.map((e) => (
              <tr key={e.gateway} className="border-b border-line last:border-0">
                <td className="py-2 font-medium">{e.gateway}</td>
                <td className="tabular py-2">{brl(e.cobrado)}</td>
                <td className="tabular py-2 text-[#0F6E56]">{brl(e.pago)}</td>
                <td className="tabular py-2 text-danger">{brl(e.vencido)}</td>
                <td className="tabular py-2 text-muted">{brl(e.repassado)}</td>
              </tr>
            ))}
            {extrato.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sem dados de gateway ainda.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function FunnelTable({ title, buckets }: { title: string; buckets?: Bucket[] }) {
  const max = Math.max(1, ...(buckets ?? []).map((b) => b.enviados));
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-4 text-sm font-medium text-ink">{title}</h2>
      <div className="space-y-3">
        {(buckets ?? []).map((b) => {
          const larguraEnvios = (b.enviados / max) * 100;
          const larguraPagos = b.enviados > 0 ? (b.pagos / b.enviados) * larguraEnvios : 0;
          return (
            <div key={b.chave}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{b.chave}</span>
                <span className="text-muted"><span className="tabular text-ink">{b.pagos}</span>/<span className="tabular">{b.enviados}</span> · <span className="tabular font-medium text-primary">{Math.round(b.taxa * 100)}%</span></span>
              </div>
              <div className="relative h-6 w-full overflow-hidden rounded bg-canvas">
                <div className="absolute inset-y-0 left-0 rounded bg-primary/20" style={{ width: `${larguraEnvios}%` }} />
                <div className="absolute inset-y-0 left-0 rounded bg-primary" style={{ width: `${larguraPagos}%` }} />
              </div>
            </div>
          );
        })}
        {(!buckets || buckets.length === 0) && <p className="py-6 text-center text-sm text-muted">Sem dados.</p>}
      </div>
      {buckets && buckets.length > 0 && (
        <div className="mt-4 flex gap-4 border-t border-line pt-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Pagos</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary/20" /> Enviados</span>
        </div>
      )}
    </div>
  );
}
