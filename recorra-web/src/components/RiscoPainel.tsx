'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { RiskBadge } from '@/components/ui';

interface Painel {
  faixa: string | null;
  score: number | null;
  faixaCalculada: string | null;
  fatores: { fator: string; pontos: number; detalhe: string }[];
  historico: { vencimento: string; pagoEm: string; diasAtraso: number }[];
  calculadoEm: string | null;
  modelo: string | null;
  manual: { faixa: string; motivo: string | null; em: string | null; por: string | null } | null;
}

const FAIXAS = [
  { valor: 'BOM', label: 'Bom pagador' },
  { valor: 'ATENCAO', label: 'Atenção' },
  { valor: 'RISCO', label: 'Risco' },
];
const nomeFaixa = (f: string | null) => FAIXAS.find((x) => x.valor === f)?.label ?? '—';
const data = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Risco do cliente: score (0–100) medido pelas últimas cobranças pagas, o porquê
 * de cada ponto, as pagas usadas no cálculo e o ajuste manual da faixa — que é a
 * que escolhe a régua de cobrança do cliente.
 */
export function RiscoPainel({ customerId, onChange }: { customerId: string; onChange?: () => void }) {
  const [p, setP] = useState<Painel | null>(null);
  const [editando, setEditando] = useState(false);
  const [faixa, setFaixa] = useState('BOM');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    api<Painel>(`/clientes/${customerId}/risco`).then(setP).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [customerId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function recalcular() {
    setBusy(true); setErro('');
    await api(`/clientes/${customerId}/risco/recalcular`, { method: 'POST' }).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    setBusy(false); carregar(); onChange?.();
  }

  async function salvarManual(nova: string | null) {
    setBusy(true); setErro('');
    try {
      const r = await api<Painel>(`/clientes/${customerId}/risco/manual`, { method: 'PUT', body: { faixa: nova, motivo } });
      setP(r); setEditando(false); setMotivo(''); onChange?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }

  if (!p) return <div className="p-4 text-sm text-muted">{erro || 'Carregando…'}</div>;
  const score = p.score;
  const cor = score === null ? 'var(--muted)' : score >= 70 ? '#0F6E56' : score >= 30 ? '#854F0B' : '#A32D2D';

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-start gap-4">
        <div>
          <div className="text-xs text-muted">Score de pagamento</div>
          <div className="tabular text-3xl font-semibold" style={{ color: cor }}>{score ?? '—'}<span className="text-base text-muted">/100</span></div>
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted">Faixa que vale (escolhe a régua)</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RiskBadge faixa={p.faixa ?? undefined} />
            {p.manual
              ? <span className="text-xs font-medium text-[#854F0B]">definida manualmente{p.manual.por ? ` por ${p.manual.por}` : ''}{p.manual.em ? ` em ${data(p.manual.em)}` : ''} · calculada: {nomeFaixa(p.faixaCalculada)}</span>
              : <span className="text-xs text-muted">automática</span>}
          </div>
          {p.manual?.motivo && <div className="mt-1 text-xs text-muted">Motivo: {p.manual.motivo}</div>}
        </div>
        <div className="flex gap-2">
          <button onClick={recalcular} disabled={busy} className="flex items-center gap-1 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas disabled:opacity-60"><RefreshCw size={13} /> Recalcular</button>
          <button onClick={() => { setFaixa(p.manual?.faixa ?? p.faixa ?? 'BOM'); setEditando((v) => !v); }} className="flex items-center gap-1 rounded border border-primary/40 bg-primary-tint px-3 py-1.5 text-xs font-medium text-primary"><Pencil size={13} /> Ajustar manualmente</button>
        </div>
      </div>

      {editando && (
        <div className="mb-3 rounded border border-line bg-canvas p-3">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">Faixa
              <select value={faixa} onChange={(e) => setFaixa(e.target.value)} className="mt-1 block rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-primary">
                {FAIXAS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-xs text-muted">Motivo (fica registrado)
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: negociou acordo, cliente antigo, histórico do ERP…" className="mt-1 block w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <button onClick={() => salvarManual(faixa)} disabled={busy} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">Salvar</button>
          </div>
          {p.manual && <button onClick={() => salvarManual(null)} disabled={busy} className="text-xs font-medium text-primary underline">Voltar ao cálculo automático</button>}
          <p className="mt-1 text-[11px] text-muted">A faixa manual vale até alguém voltar ao automático: o score continua sendo calculado, mas a régua usada é a da faixa escolhida.</p>
        </div>
      )}
      {erro && <p className="mb-2 text-sm text-danger">{erro}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-muted">Por que este score</div>
          {p.fatores.length === 0 && <p className="text-sm text-muted">Sem cálculo ainda — clique em Recalcular.</p>}
          {p.fatores.map((f, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
              <span className="text-ink">{f.detalhe}</span>
              {f.pontos !== 0 && <span className={`tabular shrink-0 font-medium ${f.pontos < 0 ? 'text-danger' : 'text-[#0F6E56]'}`}>{f.pontos > 0 ? '+' : ''}{f.pontos}</span>}
            </div>
          ))}
          {p.calculadoEm && <div className="mt-1 text-[11px] text-muted">Calculado em {new Date(p.calculadoEm).toLocaleString('pt-BR')}. Recalcula sozinho a cada pagamento e toda madrugada.</div>}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-muted">Últimas cobranças pagas (base do cálculo)</div>
          {p.historico.length === 0 && <p className="text-sm text-muted">Nenhuma cobrança paga ainda.</p>}
          {p.historico.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-muted"><tr><th className="py-1 font-medium">Vencimento</th><th className="py-1 font-medium">Pago em</th><th className="py-1 text-right font-medium">Atraso</th></tr></thead>
              <tbody>
                {p.historico.map((h, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{data(h.vencimento)}</td>
                    <td className="py-1">{new Date(h.pagoEm).toLocaleDateString('pt-BR')}</td>
                    <td className={`tabular py-1 text-right font-medium ${h.diasAtraso <= 2 ? 'text-[#0F6E56]' : h.diasAtraso <= 15 ? 'text-[#854F0B]' : 'text-danger'}`}>{h.diasAtraso <= 2 ? 'em dia' : `${h.diasAtraso} dias`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
