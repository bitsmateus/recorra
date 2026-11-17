'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, Filter, Info, RefreshCw, X, ExternalLink, Search } from 'lucide-react';
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
  // Filtros da tabela e do resumo diário
  const [fOperador, setFOperador] = useState('');
  const [fCarteira, setFCarteira] = useState('');
  const [fBusca, setFBusca] = useState('');
  const [fAtividade, setFAtividade] = useState(''); // '' | 'ativas' | 'sem-manual' | 'sem-recuperacao'
  // Quem está por trás de um número (clique na célula)
  const [det, setDet] = useState<{ operador: string; nome: string; tipo: string; rotulo: string } | null>(null);

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
  const opsFiltrados = useMemo(() => (rel?.operadores ?? []).filter((o) => {
    if (fOperador && (o.id ?? 'sem') !== fOperador) return false;
    if (fCarteira && (o.carteira ?? '') !== fCarteira) return false;
    if (fBusca.trim() && !o.nome.toLowerCase().includes(fBusca.trim().toLowerCase())) return false;
    if (fAtividade === 'ativas' && !o.ativo) return false;
    if (fAtividade === 'sem-manual' && o.disparosManuais > 0) return false;
    if (fAtividade === 'sem-recuperacao' && o.recuperadoComContato.faturas > 0) return false;
    return true;
  }), [rel, fOperador, fCarteira, fBusca, fAtividade]);
  const soma = useMemo(() => opsFiltrados.reduce((a, o) => ({
    clientes: a.clientes + o.clientesNaCarteira, auto: a.auto + o.disparosAutomaticos, manual: a.manual + o.disparosManuais, contatados: a.contatados + o.clientesContatados,
    regua: a.regua + o.recuperado.REGUA.valor + o.recuperado.CAMPANHA.valor, manualV: a.manualV + o.recuperado.MANUAL.valor, total: a.total + o.recuperadoComContato.valor, sem: a.sem + o.recuperado.SEM_CONTATO.valor,
  }), { clientes: 0, auto: 0, manual: 0, contatados: 0, regua: 0, manualV: 0, total: 0, sem: 0 }), [opsFiltrados]);
  const filtroAtivo = !!(fOperador || fCarteira || fBusca.trim() || fAtividade);
  const carteirasLista = useMemo(() => [...new Set((rel?.operadores ?? []).map((o) => o.carteira).filter(Boolean) as string[])], [rel]);
  const abrir = (o: Operador, tipo: string, rotulo: string) => setDet({ operador: o.id ?? 'sem', nome: o.nome, tipo, rotulo });
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

      {rel && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3 print:hidden">
          <label className="text-xs text-muted">Operadora
            <select value={fOperador} onChange={(e) => setFOperador(e.target.value)} className="mt-1 block rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-primary">
              <option value="">Todas</option>
              {rel.operadores.map((o) => <option key={o.id ?? 'sem'} value={o.id ?? 'sem'}>{o.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Carteira
            <select value={fCarteira} onChange={(e) => setFCarteira(e.target.value)} className="mt-1 block rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-primary">
              <option value="">Todas</option>
              {carteirasLista.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Situação
            <select value={fAtividade} onChange={(e) => setFAtividade(e.target.value)} className="mt-1 block rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-primary">
              <option value="">Todas</option>
              <option value="ativas">Só ativas</option>
              <option value="sem-manual">Sem contato manual no período</option>
              <option value="sem-recuperacao">Sem recuperação no período</option>
            </select>
          </label>
          <label className="text-xs text-muted">Buscar nome
            <span className="mt-1 flex items-center gap-1 rounded border border-line bg-surface px-2 py-1.5 focus-within:border-primary"><Search size={13} className="text-muted" /><input value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Nome da operadora" className="w-40 bg-transparent text-sm text-ink outline-none" /></span>
          </label>
          {filtroAtivo && <button onClick={() => { setFOperador(''); setFCarteira(''); setFBusca(''); setFAtividade(''); }} className="flex items-center gap-1 rounded border border-line px-3 py-1.5 text-xs text-muted hover:bg-canvas"><X size={12} /> Limpar filtros</button>}
        </div>
      )}

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
            <Kpi label="Contatos manuais" valor={num(t.disparos.manual)} detalhe="das operadoras (inclui chat NX)" cor={COR.MANUAL} />
            <Kpi label="Recuperado pela régua" valor={brl(t.recuperado.REGUA.valor + t.recuperado.CAMPANHA.valor)} detalhe={`${num(t.recuperado.REGUA.faturas + t.recuperado.CAMPANHA.faturas)} faturas`} cor={COR.REGUA} />
            <Kpi label="Recuperado no manual" valor={brl(t.recuperado.MANUAL.valor)} detalhe={`${num(t.recuperado.MANUAL.faturas)} faturas`} cor={COR.MANUAL} />
            <Kpi label="Pagou sem contato" valor={brl(t.recuperado.SEM_CONTATO.valor)} detalhe={`${num(t.recuperado.SEM_CONTATO.faturas)} faturas · fora da conta`} />
          </div>

          <Secao titulo="Por operadora" sub="Crédito pela responsável do cliente. Disparos automáticos = régua para os clientes dela; manuais = enviados por ela. Clique em qualquer número para ver quem são os clientes por trás dele.">
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
                {opsFiltrados.map((o) => (
                  <tr key={o.id ?? 'sem'} className="border-b border-line last:border-0">
                    <td className="py-2 font-medium text-ink">{o.nome}{!o.ativo && <span className="ml-1 text-xs text-muted">(inativo)</span>}
                      <button onClick={() => setFOperador(o.id ?? 'sem')} title="Ver o resumo dia a dia só desta pessoa" className="ml-2 text-[11px] font-normal text-primary hover:underline">dia a dia</button>
                    </td>
                    <td className="py-2 text-muted">{o.carteira ?? '—'}</td>
                    <Cel onClick={() => abrir(o, 'clientes', 'Clientes vencidos')}>{num(o.clientesNaCarteira)}</Cel>
                    <Cel onClick={() => abrir(o, 'automaticos', 'Disparos da régua')}>{num(o.disparosAutomaticos)}</Cel>
                    <Cel onClick={() => abrir(o, 'manuais', 'Disparos manuais')}>{num(o.disparosManuais)}</Cel>
                    <Cel onClick={() => abrir(o, 'contatados', 'Clientes contatados')}>{num(o.clientesContatados)}</Cel>
                    <Cel onClick={() => abrir(o, 'recuperado-regua', 'Recuperado pela régua')}>{brl(o.recuperado.REGUA.valor + o.recuperado.CAMPANHA.valor)}<span className="block text-[11px] text-muted">{num(o.recuperado.REGUA.faturas + o.recuperado.CAMPANHA.faturas)} fat.</span></Cel>
                    <Cel onClick={() => abrir(o, 'recuperado-manual', 'Recuperado no manual')}>{brl(o.recuperado.MANUAL.valor)}<span className="block text-[11px] text-muted">{num(o.recuperado.MANUAL.faturas)} fat.</span></Cel>
                    <Cel onClick={() => abrir(o, 'recuperado-total', 'Total recuperado')} forte>{brl(o.recuperadoComContato.valor)}<span className="block text-[11px] font-normal text-muted">{num(o.recuperadoComContato.faturas)} fat.</span></Cel>
                    <Cel onClick={() => abrir(o, 'sem-contato', 'Pagou sem contato')} suave>{brl(o.recuperado.SEM_CONTATO.valor)}</Cel>
                  </tr>
                ))}
                {opsFiltrados.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted">{rel.operadores.length === 0 ? 'Nenhuma operadora vinculada a carteiras. Vincule em Configurações → Equipe.' : 'Nenhuma operadora com esses filtros.'}</td></tr>}
              </tbody>
              {opsFiltrados.length > 1 && (
                <tfoot className="border-t border-line text-sm font-semibold text-ink">
                  <tr>
                    <td className="py-2" colSpan={2}>Total{filtroAtivo ? ' do filtro' : ''}</td>
                    <td className="tabular py-2 text-right">{num(soma.clientes)}</td><td className="tabular py-2 text-right">{num(soma.auto)}</td><td className="tabular py-2 text-right">{num(soma.manual)}</td><td className="tabular py-2 text-right">{num(soma.contatados)}</td>
                    <td className="tabular py-2 text-right">{brl(soma.regua)}</td><td className="tabular py-2 text-right">{brl(soma.manualV)}</td><td className="tabular py-2 text-right">{brl(soma.total)}</td><td className="tabular py-2 text-right text-muted">{brl(soma.sem)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Secao>

          <ResumoDiario query={query} operador={fOperador} nomeOperador={rel.operadores.find((o) => (o.id ?? 'sem') === fOperador)?.nome} />

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
      {det && <DetalheOperador det={det} query={query} onClose={() => setDet(null)} />}
    </div>
  );
}

/** Célula numérica clicável da tabela "Por operadora". */
function Cel({ children, onClick, forte, suave }: { children: React.ReactNode; onClick: () => void; forte?: boolean; suave?: boolean }) {
  return (
    <td className={`tabular py-2 text-right ${forte ? 'font-semibold text-ink' : suave ? 'text-muted' : ''}`}>
      <button type="button" onClick={onClick} title="Ver quem são" className="rounded px-1 text-right decoration-dotted underline-offset-2 hover:bg-primary-tint hover:text-primary hover:underline">{children}</button>
    </td>
  );
}

interface LinhaDet { customerId: string; cliente: string; telefone: string | null; canal?: string; quando?: string; origem?: string; valor?: number; detalhe?: string }
/** Lista de clientes/faturas/envios por trás de um número da tabela. */
function DetalheOperador({ det, query, onClose }: { det: { operador: string; nome: string; tipo: string; rotulo: string }; query: string; onClose: () => void }) {
  const [d, setD] = useState<{ titulo: string; total: number; limitado: boolean; linhas: LinhaDet[] } | null | undefined>(undefined);
  const [q, setQ] = useState('');
  useEffect(() => {
    let vivo = true;
    setD(undefined);
    const p = new URLSearchParams(query); p.set('tipo', det.tipo);
    api<{ titulo: string; total: number; limitado: boolean; linhas: LinhaDet[] }>(`/recuperacao/relatorio/operador/${det.operador}/detalhe?${p}`).then((r) => { if (vivo) setD(r); }).catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [det, query]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  const linhas = (d?.linhas ?? []).filter((l) => !q.trim() || `${l.cliente} ${l.telefone ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const temValor = linhas.some((l) => l.valor !== undefined);
  const temCanal = linhas.some((l) => l.canal);
  const totalValor = linhas.reduce((t, l) => t + (l.valor ?? 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-label={det.rotulo} className="flex h-full w-full max-w-3xl flex-col bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h3 className="text-base font-semibold text-ink">{det.nome} · {det.rotulo}</h3>
            <p className="text-xs text-muted">{d ? `${d.titulo} · ${d.total}${d.limitado ? '+' : ''} registro(s)` : 'Carregando…'}{temValor && d ? ` · ${brl(totalValor)}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="border-b border-line p-3">
          <span className="flex items-center gap-1 rounded border border-line px-2 py-1.5 focus-within:border-primary"><Search size={13} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou telefone" className="w-full bg-transparent text-sm outline-none" /></span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {d === undefined && <p className="py-8 text-center text-sm text-muted">Carregando…</p>}
          {d === null && <p className="py-8 text-center text-sm text-danger">Não foi possível carregar.</p>}
          {d && linhas.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhum registro.</p>}
          {d && linhas.length > 0 && (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-muted">
                <tr><th className="py-2 font-medium">Cliente</th>{temCanal && <th className="py-2 font-medium">Canal</th>}<th className="py-2 font-medium">Quando</th>{temValor && <th className="py-2 text-right font-medium">Valor</th>}<th className="py-2 pl-3 font-medium">Detalhe</th></tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.customerId}-${i}`} className="border-b border-line align-top last:border-0">
                    <td className="py-2"><Link href={`/clientes/${l.customerId}`} className="inline-flex items-center gap-1 font-medium text-ink hover:text-primary hover:underline">{l.cliente}<ExternalLink size={11} className="text-muted" /></Link><span className="block text-[11px] text-muted">{l.telefone ?? 'sem telefone'}</span></td>
                    {temCanal && <td className="py-2 text-muted">{l.canal ?? ''}</td>}
                    <td className="whitespace-nowrap py-2 text-muted">{l.quando ?? ''}{l.origem && <span className="block text-[11px]">{l.origem}</span>}</td>
                    {temValor && <td className="tabular py-2 text-right">{l.valor !== undefined ? brl(l.valor) : ''}</td>}
                    <td className="py-2 pl-3 text-xs text-muted">{l.detalhe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d?.limitado && <p className="mt-2 text-center text-xs text-muted">Mostrando os 1.000 mais recentes. Use o CSV/Excel completo para a lista inteira.</p>}
        </div>
      </div>
    </div>
  );
}

interface DiaResumo { dia: string; automaticos: number; manuais: number; contatados: number; promessas: number; valorPrometido: number; recuperadoRegua: number; faturasRegua: number; recuperadoManual: number; faturasManual: number }
/** Resumo dia a dia (toda a equipe ou só a operadora filtrada). */
function ResumoDiario({ query, operador, nomeOperador }: { query: string; operador: string; nomeOperador?: string }) {
  const [dias, setDias] = useState<DiaResumo[] | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setDias(undefined);
    const p = new URLSearchParams(query); if (operador) p.set('operador', operador);
    api<{ dias: DiaResumo[] }>(`/recuperacao/relatorio/diario?${p}`).then((r) => { if (vivo) setDias(r.dias); }).catch(() => { if (vivo) setDias(null); });
    return () => { vivo = false; };
  }, [query, operador]);
  const tot = (dias ?? []).reduce((a, d) => ({ auto: a.auto + d.automaticos, man: a.man + d.manuais, prom: a.prom + d.promessas, rr: a.rr + d.recuperadoRegua, rm: a.rm + d.recuperadoManual }), { auto: 0, man: 0, prom: 0, rr: 0, rm: 0 });
  return (
    <Secao titulo={`Resumo diário${nomeOperador ? ` · ${nomeOperador}` : ' · toda a equipe'}`} sub="Dia a dia no período: o que foi disparado, quantos clientes foram contatados, promessas registradas e o que foi recuperado. Use o filtro de operadora acima para ver só uma pessoa.">
      {dias === undefined && <p className="py-6 text-center text-sm text-muted">Carregando…</p>}
      {dias === null && <p className="py-6 text-center text-sm text-danger">Não foi possível carregar o resumo diário.</p>}
      {dias && (
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-muted">
            <tr><th className="py-2 font-medium">Dia</th><th className="py-2 text-right font-medium">Disp. régua</th><th className="py-2 text-right font-medium">Disp. manuais</th><th className="py-2 text-right font-medium">Clientes contatados</th><th className="py-2 text-right font-medium">Promessas</th><th className="py-2 text-right font-medium">Rec. régua</th><th className="py-2 text-right font-medium">Rec. manual</th><th className="py-2 text-right font-medium">Total do dia</th></tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia} className="border-b border-line last:border-0">
                <td className="py-2 font-medium text-ink">{d.dia.split('-').reverse().join('/')}</td>
                <td className="tabular py-2 text-right">{num(d.automaticos)}</td>
                <td className="tabular py-2 text-right">{num(d.manuais)}</td>
                <td className="tabular py-2 text-right">{num(d.contatados)}</td>
                <td className="tabular py-2 text-right">{num(d.promessas)}{d.valorPrometido > 0 && <span className="block text-[11px] text-muted">{brl(d.valorPrometido)}</span>}</td>
                <td className="tabular py-2 text-right">{brl(d.recuperadoRegua)}<span className="block text-[11px] text-muted">{num(d.faturasRegua)} fat.</span></td>
                <td className="tabular py-2 text-right">{brl(d.recuperadoManual)}<span className="block text-[11px] text-muted">{num(d.faturasManual)} fat.</span></td>
                <td className="tabular py-2 text-right font-semibold text-ink">{brl(d.recuperadoRegua + d.recuperadoManual)}</td>
              </tr>
            ))}
            {dias.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted">Sem movimento no período.</td></tr>}
          </tbody>
          {dias.length > 1 && (
            <tfoot className="border-t border-line text-sm font-semibold text-ink">
              <tr><td className="py-2">Total</td><td className="tabular py-2 text-right">{num(tot.auto)}</td><td className="tabular py-2 text-right">{num(tot.man)}</td><td className="py-2" /><td className="tabular py-2 text-right">{num(tot.prom)}</td><td className="tabular py-2 text-right">{brl(tot.rr)}</td><td className="tabular py-2 text-right">{brl(tot.rm)}</td><td className="tabular py-2 text-right">{brl(tot.rr + tot.rm)}</td></tr>
            </tfoot>
          )}
        </table>
      )}
    </Secao>
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
  const passoEixo = passoBonito(Math.max(1, ...serie.map(totalDia)) / 3);
  const max = passoEixo * Math.max(1, Math.ceil(Math.max(1, ...serie.map(totalDia)) / passoEixo));
  const bw = serie.length ? (w - padL - padR) / serie.length : 0;
  const y = (v: number) => (v / max) * (h - padTop - padBottom);
  const ticks = Array.from({ length: Math.round(max / passoEixo) + 1 }, (_, k) => k * passoEixo);
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
                <text x={padL - 6} y={h - padBottom - y(v) + 3} textAnchor="end" className="fill-muted text-[10px]">{v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.round(v)}</text>
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
                    // 2px de respiro entre segmentos: corta o TOPO do segmento de baixo (a base fica no eixo).
                    const gap = ultimo ? 0 : Math.min(2, alt);
                    return (
                      <path key={s} d={barra(x + 1, topo + gap, largura, alt - gap, ultimo ? 3 : 0)}
                        fill={COR[s]} opacity={foco === null || foco === i ? 1 : 0.45} />
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

/** Retângulo com só os cantos de CIMA arredondados (a base fica reta, presa no eixo). */
function barra(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Passo "redondo" do eixo (1, 2, 2,5 ou 5 × 10^n) — rótulos que batem com as linhas. */
function passoBonito(bruto: number): number {
  const mag = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
