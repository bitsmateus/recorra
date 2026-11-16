'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, Info, RefreshCw } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { brl } from '@/components/ui';
import { PERIODOS, PeriodoChave, intervaloDe, rotuloPeriodo } from '@/lib/periodo';

type Origem = 'REGUA' | 'MANUAL' | 'CAMPANHA' | 'SEM_CONTATO';
interface Soma { valor: number; faturas: number }
type PorOrigem = Record<Origem, Soma>;
interface Operador {
  id: string | null; nome: string; carteira: string | null; ativo: boolean;
  clientesNaCarteira: number; disparosAutomaticos: number; disparosManuais: number; clientesContatados: number;
  recuperado: PorOrigem; recuperadoComContato: Soma;
}
interface Relatorio {
  periodo: { de: string; ate: string };
  janelaDias: number;
  pendentesAtribuicao: number;
  totais: {
    disparos: { total: number; regua: number; manual: number; campanha: number };
    clientesContatados: number;
    recuperado: PorOrigem;
    recuperadoComContato: Soma;
    recebido: Soma;
  };
  operadores: Operador[];
  carteiras: { nome: string; recuperado: PorOrigem; faturas: number; valor: number }[];
  canais: { canal: string; conta: string; disparosRegua: number; disparosManuais: number; faturas: number; valor: number }[];
  serie: ({ dia: string } & Record<Origem, number>)[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const num = (n: number) => n.toLocaleString('pt-BR');
// Paleta validada (CVD/contraste) para claro e escuro — ver skill de dataviz.
const COR: Record<Exclude<Origem, 'SEM_CONTATO'>, string> = {
  REGUA: 'var(--serie-regua)',
  MANUAL: 'var(--serie-manual)',
  CAMPANHA: 'var(--serie-campanha)',
};
const ROTULO: Record<Origem, string> = {
  REGUA: 'Régua (automático)',
  MANUAL: 'Manual',
  CAMPANHA: 'Campanha',
  SEM_CONTATO: 'Pagou sem contato',
};

/** Relatório "Disparos × Recuperado" por origem e por operadora (crédito = responsável). */
export function RecuperacaoOperadores() {
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState('');
  const [periodo, setPeriodo] = useState<PeriodoChave>('mes');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const query = useMemo(() => {
    const r = periodo === 'custom' ? { de, ate } : intervaloDe(periodo)!;
    const p = new URLSearchParams();
    if (r.de) p.set('de', r.de);
    if (r.ate) p.set('ate', r.ate);
    return p.toString();
  }, [periodo, de, ate]);
  const rotulo = useMemo(() => rotuloPeriodo(periodo, de, ate), [periodo, de, ate]);

  const carregar = useCallback(() => {
    setErro('');
    api<Relatorio>(`/recuperacao/relatorio${query ? `?${query}` : ''}`)
      .then(setRel)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'));
  }, [query]);
  useEffect(() => { carregar(); }, [carregar]);

  async function atualizarAgora() {
    setAtualizando(true);
    await api('/recuperacao/atribuir', { method: 'POST' }).catch(() => {});
    setAtualizando(false);
    carregar();
  }

  async function exportarCsv() {
    const res = await fetch(`${API_URL}/recuperacao/relatorio/export.csv${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = 'recuperacao.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  async function exportarExcel() {
    const r = await api<{ filename: string; base64: string; mime: string }>(`/recuperacao/relatorio/export.xlsx${query ? `?${query}` : ''}`).catch(() => null);
    if (!r) return;
    const a = document.createElement('a');
    a.href = `data:${r.mime};base64,${r.base64}`;
    a.download = r.filename; a.click();
  }

  const t = rel?.totais;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Disparos × recuperado por origem e por operadora · {rotulo}</p>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={exportarCsv} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><Download size={14} /> CSV (faturas)</button>
          <button onClick={exportarExcel} className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-xs hover:bg-canvas"><FileSpreadsheet size={14} /> Excel completo</button>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-surface p-3 print:hidden">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Filter size={14} /> Período (data do pagamento e do disparo)</div>
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

      {erro && <p className="mb-4 rounded border border-line bg-danger-tint p-3 text-sm text-danger">{erro}</p>}

      {rel && t && (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-primary-tint p-3 text-xs text-ink">
            <Info size={14} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <b>Como ler:</b> o crédito de cada fatura paga é da <b>operadora responsável</b> pelo cliente, seja o contato automático (régua) ou manual.
              A <b>origem</b> é o último contato até <b>{rel.janelaDias} dias</b> antes do pagamento — notas e promessas registradas pela operadora contam como contato manual.
              {rel.pendentesAtribuicao > 0 && (
                <span className="ml-1">
                  {num(rel.pendentesAtribuicao)} pagamento(s) recente(s) ainda em processamento.{' '}
                  <button onClick={atualizarAgora} disabled={atualizando} className="inline-flex items-center gap-1 font-medium text-primary underline disabled:opacity-50">
                    <RefreshCw size={12} className={atualizando ? 'animate-spin' : ''} /> Atualizar agora
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Disparos da régua" valor={num(t.disparos.regua + t.disparos.campanha)} detalhe={t.disparos.campanha ? `${num(t.disparos.campanha)} de campanha` : 'automáticos'} cor={COR.REGUA} />
            <Kpi label="Contatos manuais" valor={num(t.disparos.manual)} detalhe="enviados pelas operadoras" cor={COR.MANUAL} />
            <Kpi label="Recuperado pela régua" valor={brl(t.recuperado.REGUA.valor + t.recuperado.CAMPANHA.valor)} detalhe={`${num(t.recuperado.REGUA.faturas + t.recuperado.CAMPANHA.faturas)} faturas`} cor={COR.REGUA} />
            <Kpi label="Recuperado no manual" valor={brl(t.recuperado.MANUAL.valor)} detalhe={`${num(t.recuperado.MANUAL.faturas)} faturas`} cor={COR.MANUAL} />
            <Kpi label="Pagou sem contato" valor={brl(t.recuperado.SEM_CONTATO.valor)} detalhe={`${num(t.recuperado.SEM_CONTATO.faturas)} faturas · fora da conta`} />
          </div>

          <Secao titulo="Por operadora" sub="Crédito pela responsável do cliente. Disparos automáticos = régua para os clientes dela; manuais = enviados por ela.">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 font-medium">Operadora</th>
                  <th className="py-2 font-medium">Carteira</th>
                  <th className="py-2 text-right font-medium">Clientes vencidos</th>
                  <th className="py-2 text-right font-medium">Disp. régua</th>
                  <th className="py-2 text-right font-medium">Disp. manuais</th>
                  <th className="py-2 text-right font-medium">Contatados</th>
                  <th className="py-2 text-right font-medium">Rec. régua</th>
                  <th className="py-2 text-right font-medium">Rec. manual</th>
                  <th className="py-2 text-right font-medium">Total recuperado</th>
                  <th className="py-2 text-right font-medium">Sem contato</th>
                </tr>
              </thead>
              <tbody>
                {rel.operadores.map((o) => (
                  <tr key={o.id ?? 'sem'} className="border-b border-line last:border-0">
                    <td className="py-2 font-medium text-ink">{o.nome}{!o.ativo && <span className="ml-1 text-xs text-muted">(inativo)</span>}</td>
                    <td className="py-2 text-muted">{o.carteira ?? '—'}</td>
                    <td className="tabular py-2 text-right">{num(o.clientesNaCarteira)}</td>
                    <td className="tabular py-2 text-right">{num(o.disparosAutomaticos)}</td>
                    <td className="tabular py-2 text-right">{num(o.disparosManuais)}</td>
                    <td className="tabular py-2 text-right">{num(o.clientesContatados)}</td>
                    <td className="tabular py-2 text-right">{brl(o.recuperado.REGUA.valor + o.recuperado.CAMPANHA.valor)}<span className="block text-[11px] text-muted">{num(o.recuperado.REGUA.faturas + o.recuperado.CAMPANHA.faturas)} fat.</span></td>
                    <td className="tabular py-2 text-right">{brl(o.recuperado.MANUAL.valor)}<span className="block text-[11px] text-muted">{num(o.recuperado.MANUAL.faturas)} fat.</span></td>
                    <td className="tabular py-2 text-right font-semibold text-ink">{brl(o.recuperadoComContato.valor)}<span className="block text-[11px] font-normal text-muted">{num(o.recuperadoComContato.faturas)} fat.</span></td>
                    <td className="tabular py-2 text-right text-muted">{brl(o.recuperado.SEM_CONTATO.valor)}</td>
                  </tr>
                ))}
                {rel.operadores.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted">Nenhuma operadora vinculada a carteiras. Vincule em Configurações → Equipe.</td></tr>}
              </tbody>
            </table>
          </Secao>

          <div className="mb-6">
            <GraficoDiario serie={rel.serie} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Secao titulo="Por carteira" sub="Pela faixa de atraso no dia do pagamento.">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase text-muted">
                  <tr><th className="py-2 font-medium">Carteira</th><th className="py-2 text-right font-medium">Régua</th><th className="py-2 text-right font-medium">Manual</th><th className="py-2 text-right font-medium">Sem contato</th><th className="py-2 text-right font-medium">Faturas</th></tr>
                </thead>
                <tbody>
                  {rel.carteiras.map((c) => (
                    <tr key={c.nome} className="border-b border-line last:border-0">
                      <td className="py-2 font-medium text-ink">{c.nome}</td>
                      <td className="tabular py-2 text-right">{brl(c.recuperado.REGUA.valor + c.recuperado.CAMPANHA.valor)}</td>
                      <td className="tabular py-2 text-right">{brl(c.recuperado.MANUAL.valor)}</td>
                      <td className="tabular py-2 text-right text-muted">{brl(c.recuperado.SEM_CONTATO.valor)}</td>
                      <td className="tabular py-2 text-right">{num(c.faturas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Secao>
            <Secao titulo="Por canal e número" sub="Recuperado = o último contato antes do pagamento saiu por esta conta.">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase text-muted">
                  <tr><th className="py-2 font-medium">Canal</th><th className="py-2 font-medium">Conta / número</th><th className="py-2 text-right font-medium">Disp. régua</th><th className="py-2 text-right font-medium">Disp. manuais</th><th className="py-2 text-right font-medium">Recuperado</th></tr>
                </thead>
                <tbody>
                  {rel.canais.map((c) => (
                    <tr key={`${c.canal}|${c.conta}`} className="border-b border-line last:border-0">
                      <td className="py-2 font-medium text-ink">{c.canal}</td>
                      <td className="py-2 text-muted">{c.conta}</td>
                      <td className="tabular py-2 text-right">{num(c.disparosRegua)}</td>
                      <td className="tabular py-2 text-right">{num(c.disparosManuais)}</td>
                      <td className="tabular py-2 text-right">{brl(c.valor)}<span className="block text-[11px] text-muted">{num(c.faturas)} fat.</span></td>
                    </tr>
                  ))}
                  {rel.canais.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sem disparos no período.</td></tr>}
                </tbody>
              </table>
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor, detalhe, cor }: { label: string; valor: string; detalhe: string; cor?: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {cor && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />}
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-semibold text-ink">{valor}</div>
      <div className="text-[11px] text-muted">{detalhe}</div>
    </div>
  );
}

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-ink">{titulo}</h2>
      {sub && <p className="mb-3 text-xs text-muted">{sub}</p>}
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}

/** Recuperado por dia, barras empilhadas régua/manual/campanha (pagou sem contato fica fora). */
function GraficoDiario({ serie }: { serie: Relatorio['serie'] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const series: Exclude<Origem, 'SEM_CONTATO'>[] = ['REGUA', 'MANUAL', 'CAMPANHA'];
  const usadas = series.filter((s) => serie.some((d) => d[s] > 0));
  const w = 760, h = 230, padL = 56, padR = 8, padTop = 12, padBottom = 26;
  const totalDia = (d: Relatorio['serie'][number]) => usadas.reduce((s, k) => s + d[k], 0);
  const max = Math.max(1, ...serie.map(totalDia));
  const bw = serie.length ? (w - padL - padR) / serie.length : 0;
  const y = (v: number) => (v / max) * (h - padTop - padBottom);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const passoRotulo = Math.max(1, Math.ceil(serie.length / 10));
  const atual = foco !== null ? serie[foco] : null;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">Recuperado por dia</h2>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {usadas.map((s) => (
            <span key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR[s] }} />{ROTULO[s]}</span>
          ))}
        </div>
      </div>
      {serie.length === 0 || usadas.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Sem recuperação no período.</p>
      ) : (
        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full min-w-[560px]" onMouseLeave={() => setFoco(null)}>
            {ticks.map((v, i) => (
              <g key={i}>
                <line x1={padL} x2={w - padR} y1={h - padBottom - y(v)} y2={h - padBottom - y(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={padL - 6} y={h - padBottom - y(v) + 3} textAnchor="end" className="fill-muted text-[10px]">{v >= 1000 ? `${Math.round(v / 1000)} mil` : Math.round(v)}</text>
              </g>
            ))}
            {serie.map((d, i) => {
              let topo = h - padBottom;
              const x = padL + i * bw;
              const largura = Math.max(2, bw - 2);
              return (
                <g key={d.dia} onMouseEnter={() => setFoco(i)}>
                  <rect x={x} y={padTop} width={bw} height={h - padTop - padBottom} fill="transparent" />
                  {usadas.map((s, k) => {
                    const alt = y(d[s]);
                    if (alt <= 0) return null;
                    topo -= alt;
                    const ultimo = usadas.slice(k + 1).every((r) => d[r] <= 0);
                    return (
                      <rect key={s} x={x + 1} y={topo} width={largura} height={Math.max(0, alt - (ultimo ? 0 : 2))}
                        rx={ultimo ? 3 : 0} fill={COR[s]} opacity={foco === null || foco === i ? 1 : 0.45} />
                    );
                  })}
                  {i % passoRotulo === 0 && (
                    <text x={x + bw / 2} y={h - padBottom + 14} textAnchor="middle" className="fill-muted text-[10px]">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {atual && (
            <div className="pointer-events-none absolute right-2 top-0 rounded border border-line bg-surface px-3 py-2 text-xs shadow">
              <div className="mb-1 font-medium text-ink">{atual.dia.split('-').reverse().join('/')}</div>
              {usadas.map((s) => (
                <div key={s} className="flex items-center justify-between gap-4 text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COR[s] }} />{ROTULO[s]}</span>
                  <span className="tabular text-ink">{brl(atual[s])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
