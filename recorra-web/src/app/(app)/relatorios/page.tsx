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
          <Metric label="Lucro" value={brl(roi.lucro)} accent="#0E7C7B" />
          <Metric label="Retorno por R$1" value={`${roi.retornoPorReal}x`} accent="#0E7C7B" />
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
        <table className="w-full text-sm">
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
        </table>
      </div>
    </div>
  );
}

function FunnelTable({ title, buckets }: { title: string; buckets?: Bucket[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase text-muted">
          <tr><th className="py-2 font-medium">Chave</th><th className="py-2 font-medium">Envios</th><th className="py-2 font-medium">Pagos</th><th className="py-2 font-medium">Taxa</th></tr>
        </thead>
        <tbody>
          {(buckets ?? []).map((b) => (
            <tr key={b.chave} className="border-b border-line last:border-0">
              <td className="py-2">{b.chave}</td>
              <td className="tabular py-2">{b.enviados}</td>
              <td className="tabular py-2">{b.pagos}</td>
              <td className="tabular py-2 text-primary">{Math.round(b.taxa * 100)}%</td>
            </tr>
          ))}
          {(!buckets || buckets.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-muted">Sem dados.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
