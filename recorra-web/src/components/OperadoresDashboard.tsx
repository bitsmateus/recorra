'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Linha {
  id: string | null; nome: string; carteira: string | null; ativo: boolean;
  disparos: { automaticos: number; manuais: number; chatNx: number; total: number; falhas: number; clientes: number };
  chamados: { recebidos: number; chatNx: number; inbox: number; promessas: number; atendidos: number };
}
interface Dados {
  operadores: Linha[];
  totais: {
    disparos: { automaticos: number; manuais: number; chatNx: number; falhas: number };
    chamados: { recebidos: number; atendidos: number; promessas: number };
  };
}

const num = (n: number) => n.toLocaleString('pt-BR');
// Cores validadas (daltonismo/contraste) das séries do relatório de recuperação.
const COR = { regua: 'var(--serie-regua)', manual: 'var(--serie-manual)', chat: 'var(--serie-campanha)' };

/** Barra empilhada pequena: cada fatia é uma série, na ordem da legenda. */
function Barra({ partes, max }: { partes: { valor: number; cor: string; nome: string }[]; max: number }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex h-2.5 w-full min-w-[96px] overflow-hidden rounded-full bg-canvas" role="img" aria-label={partes.map((p) => `${p.nome}: ${p.valor}`).join(', ')}>
      {max > 0 && partes.map((p) => p.valor > 0 && (
        <div key={p.nome} title={`${p.nome}: ${num(p.valor)}`} style={{ width: `${(p.valor / max) * 100}%`, background: p.cor, marginRight: 2 }} />
      ))}
      {total === 0 && null}
    </div>
  );
}

function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted">
      {itens.map((i) => <span key={i.nome} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />{i.nome}</span>)}
    </div>
  );
}

/**
 * "Por operador" do Dashboard: disparos (régua × manual × chat NX) e chamados
 * (atendimentos) de cada operadora, no mesmo período do resto da página.
 */
export function OperadoresDashboard({ query, rotulo }: { query: string; rotulo: string }) {
  const [d, setD] = useState<Dados | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setD(undefined);
    api<Dados>(`/dashboard/operadores${query ? `?${query}` : ''}`).then((r) => { if (vivo) setD(r); }).catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [query]);

  if (d === undefined) return <p className="mt-6 text-sm text-muted">Carregando operadores…</p>;
  if (d === null) return <p className="mt-6 text-sm text-muted">Não foi possível carregar os dados por operador.</p>;

  const maxDisp = Math.max(1, ...d.operadores.map((o) => o.disparos.total));
  const maxCham = Math.max(1, ...d.operadores.map((o) => o.chamados.atendidos));

  return (
    <section className="mt-8" aria-labelledby="por-operador">
      <h2 id="por-operador" className="font-display text-lg font-semibold text-ink">Por operador</h2>
      <p className="mb-4 text-xs text-muted">Disparos e chamados de cada pessoa da equipe · {rotulo}</p>

      <div className="mb-4 rounded-lg border border-line bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Disparos por operador</h3>
          <Legenda itens={[{ nome: 'Régua (para os clientes dela)', cor: COR.regua }, { nome: 'Manuais (enviados por ela)', cor: COR.manual }, { nome: 'Conversas no chat NX', cor: COR.chat }]} />
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-2 font-medium">Operador</th>
                <th className="py-2 font-medium">Carteira</th>
                <th className="py-2 text-right font-medium">Régua</th>
                <th className="py-2 text-right font-medium">Manuais</th>
                <th className="py-2 text-right font-medium">Chat NX</th>
                <th className="py-2 text-right font-medium" title="Falharam na entrega (qualquer origem)">Falhas</th>
                <th className="py-2 text-right font-medium">Clientes</th>
                <th className="w-40 py-2 pl-4 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.operadores.map((o) => (
                <tr key={o.id ?? 'sem'} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium text-ink">{o.nome}{!o.ativo && <span className="ml-1 text-xs text-muted">(inativo)</span>}</td>
                  <td className="py-2 text-muted">{o.carteira ?? '—'}</td>
                  <td className="tabular py-2 text-right">{num(o.disparos.automaticos)}</td>
                  <td className="tabular py-2 text-right">{num(o.disparos.manuais)}</td>
                  <td className="tabular py-2 text-right">{num(o.disparos.chatNx)}</td>
                  <td className={`tabular py-2 text-right ${o.disparos.falhas ? 'text-danger' : 'text-muted'}`}>{num(o.disparos.falhas)}</td>
                  <td className="tabular py-2 text-right text-muted">{num(o.disparos.clientes)}</td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center justify-end gap-2">
                      <Barra max={maxDisp} partes={[
                        { valor: o.disparos.automaticos, cor: COR.regua, nome: 'Régua' },
                        { valor: o.disparos.manuais, cor: COR.manual, nome: 'Manuais' },
                        { valor: o.disparos.chatNx, cor: COR.chat, nome: 'Chat NX' },
                      ]} />
                      <span className="tabular w-12 shrink-0 text-right font-semibold text-ink">{num(o.disparos.total)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {d.operadores.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted">Sem disparos no período.</td></tr>}
            </tbody>
            {d.operadores.length > 0 && (
              <tfoot className="border-t border-line text-sm font-semibold text-ink">
                <tr>
                  <td className="py-2" colSpan={2}>Total</td>
                  <td className="tabular py-2 text-right">{num(d.totais.disparos.automaticos)}</td>
                  <td className="tabular py-2 text-right">{num(d.totais.disparos.manuais)}</td>
                  <td className="tabular py-2 text-right">{num(d.totais.disparos.chatNx)}</td>
                  <td className="tabular py-2 text-right">{num(d.totais.disparos.falhas)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">Régua e campanhas contam para a responsável pelo cliente; “Sem responsável” são clientes que ainda não foram distribuídos. Manuais e chat NX contam para quem enviou.</p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Chamados (atendimentos) por operador</h3>
          <Legenda itens={[{ nome: 'Conversas no chat NX', cor: COR.chat }, { nome: 'Respondidos na caixa de entrada', cor: COR.manual }]} />
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-2 font-medium">Operador</th>
                <th className="py-2 font-medium">Carteira</th>
                <th className="py-2 text-right font-medium" title="Clientes que responderam e o atendimento foi para a fila dela">Cliente respondeu</th>
                <th className="py-2 text-right font-medium">Chat NX</th>
                <th className="py-2 text-right font-medium">Caixa de entrada</th>
                <th className="py-2 text-right font-medium" title="Promessas de pagamento que ela registrou">Promessas</th>
                <th className="w-40 py-2 pl-4 text-right font-medium">Atendidos</th>
              </tr>
            </thead>
            <tbody>
              {d.operadores.filter((o) => o.id !== null).map((o) => (
                <tr key={o.id ?? 'sem'} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium text-ink">{o.nome}{!o.ativo && <span className="ml-1 text-xs text-muted">(inativo)</span>}</td>
                  <td className="py-2 text-muted">{o.carteira ?? '—'}</td>
                  <td className="tabular py-2 text-right">{num(o.chamados.recebidos)}</td>
                  <td className="tabular py-2 text-right">{num(o.chamados.chatNx)}</td>
                  <td className="tabular py-2 text-right">{num(o.chamados.inbox)}</td>
                  <td className="tabular py-2 text-right">{num(o.chamados.promessas)}</td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center justify-end gap-2">
                      <Barra max={maxCham} partes={[
                        { valor: o.chamados.chatNx, cor: COR.chat, nome: 'Chat NX' },
                        { valor: o.chamados.inbox, cor: COR.manual, nome: 'Caixa de entrada' },
                      ]} />
                      <span className="tabular w-12 shrink-0 text-right font-semibold text-ink">{num(o.chamados.atendidos)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line text-sm font-semibold text-ink">
              <tr>
                <td className="py-2" colSpan={2}>Total</td>
                <td className="tabular py-2 text-right">{num(d.totais.chamados.recebidos)}</td>
                <td className="tabular py-2 text-right">{num(d.operadores.reduce((t, o) => t + o.chamados.chatNx, 0))}</td>
                <td className="tabular py-2 text-right">{num(d.operadores.reduce((t, o) => t + o.chamados.inbox, 0))}</td>
                <td className="tabular py-2 text-right">{num(d.totais.chamados.promessas)}</td>
                <td className="tabular py-2 pr-0 text-right">{num(d.totais.chamados.atendidos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          <b>Atendidos</b> = conversas da pessoa no chat do NX (uma por atendimento por dia) + conversas que ela respondeu na caixa de entrada do Recorrai.
          <b> Cliente respondeu</b> = clientes dela que responderam e caíram na fila dela. Dependem do webhook do chat NX ligado em Canais.
        </p>
      </div>
    </section>
  );
}
