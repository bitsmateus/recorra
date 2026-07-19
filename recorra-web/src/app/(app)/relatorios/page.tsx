'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, FileSpreadsheet, FileText, Filter } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';
import { PERIODOS, PeriodoChave, intervaloDe, rotuloPeriodo } from '@/lib/periodo';

interface Bucket { chave: string; enviados: number; pagos: number; taxa: number }
interface Funnel { porCanal: Bucket[]; porPasso: Bucket[] }
interface Roi { custo: number; recuperado: number; lucro: number; retornoPorReal: number }
interface Extrato { gateway: string; cobrado: number; pago: number; pendente: number; vencido: number; repassado: number }
interface MesRec { mes: string; label: string; recebido: number; faturas: number }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const num = (n: number) => n.toLocaleString('pt-BR');

export default function RelatoriosPage() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [roi, setRoi] = useState<Roi | null>(null);
  const [extrato, setExtrato] = useState<Extrato[]>([]);
  const [serie, setSerie] = useState<MesRec[]>([]);
  const [periodo, setPeriodo] = useState<PeriodoChave>('mes');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const query = useMemo(() => {
    const r = periodo === 'custom' ? { de, ate } : intervaloDe(periodo)!;
    const p = new URLSearchParams();
    if (r.de) p.set('de', r.de);
    if (r.ate) p.set('ate', r.ate);
    return p.toString();
  }, [periodo, de, ate]);
  const rotulo = useMemo(() => rotuloPeriodo(periodo, de, ate), [periodo, de, ate]);

  const carregar = useCallback(() => {
    const qs = query ? `?${query}` : '';
    api<Funnel>(`/relatorios/funil${qs}`).then(setFunnel).catch(() => {});
    api<Roi>(`/relatorios/roi${qs}`).then(setRoi).catch(() => {});
    api<Extrato[]>(`/relatorios/extrato${qs}`).then(setExtrato).catch(() => {});
  }, [query]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { api<MesRec[]>('/relatorios/recuperacao-mensal?meses=12').then(setSerie).catch(() => {}); }, []);

  async function exportarCsv() {
    const res = await fetch(`${API_URL}/relatorios/export/faturas.csv${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'faturas.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  async function exportarExcel() {
    const r = await api<{ filename: string; base64: string; mime: string }>(`/relatorios/export/faturas.xlsx${query ? `?${query}` : ''}`).catch(() => null);
    if (!r) return;
    const a = document.createElement('a');
    a.href = `data:${r.mime};base64,${r.base64}`;
    a.download = r.filename; a.click();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Relatórios" subtitle={`Recuperação, ROI da comunicação e extrato por gateway · ${rotulo}`} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={exportarCsv} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><Download size={14} /> CSV</button>
          <button onClick={exportarExcel} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><FileSpreadsheet size={14} /> Excel</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><FileText size={14} /> PDF</button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-surface p-3 print:hidden">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Filter size={14} /> Período</div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => (
            <button key={p.chave} onClick={() => setPeriodo(p.chave)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${periodo === p.chave ? 'border-primary bg-primary text-white' : 'border-line text-muted hover:border-primary hover:text-primary'}`}>{p.label}</button>
          ))}
          {periodo === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-primary" />
              <span className="text-xs text-muted">até</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-primary" />
            </div>
          )}
        </div>
      </div>

      {roi && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Custo de comunicação" value={brl(roi.custo)} accent="#EF4444" />
          <Metric label="Recuperado no período" value={brl(roi.recuperado)} accent="#0F6E56" />
          <Metric label="Lucro" value={brl(roi.lucro)} accent="#14857C" />
          <Metric label="Retorno por R$1" value={`${roi.retornoPorReal}x`} accent="#14857C" />
        </div>
      )}

      <div className="mb-6">
        <RecuperacaoChart dados={serie} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FunnelTable title="Funil por canal" buckets={funnel?.porCanal} />
        <FunnelTable title="Funil por passo (dias vs. vencimento)" buckets={funnel?.porPasso} />
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink">Extrato por gateway</h2>
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
            {extrato.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sem dados de gateway neste período.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

/** Recebido por mês (últimos 12), em barras SVG. Independe do filtro de período. */
function RecuperacaoChart({ dados }: { dados: MesRec[] }) {
  const w = 720, h = 220, padX = 36, padTop = 16, padBottom = 28;
  const max = Math.max(1, ...dados.map((d) => d.recebido));
  const bw = dados.length ? (w - padX * 2) / dados.length : 0;
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Recuperado por mês</h2>
        <span className="text-xs text-muted">últimos 12 meses</span>
      </div>
      {dados.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Sem dados.</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full min-w-[560px]">
            {dados.map((d, i) => {
              const x = padX + i * bw;
              const topo = y(d.recebido);
              const alturaBarra = h - padBottom - topo;
              return (
                <g key={d.mes}>
                  <title>{`${d.label}: ${brl(d.recebido)} · ${d.faturas} fatura(s)`}</title>
                  <rect x={x + bw * 0.15} y={topo} width={bw * 0.7} height={Math.max(0, alturaBarra)} rx={3} fill="#14857C" />
                  <text x={x + bw / 2} y={h - padBottom + 14} textAnchor="middle" className="fill-muted text-[10px]">{d.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
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
                <span className="text-muted"><span className="tabular text-ink">{num(b.pagos)}</span>/<span className="tabular">{num(b.enviados)}</span> · <span className="tabular font-medium text-primary">{Math.round(b.taxa * 100)}%</span></span>
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
