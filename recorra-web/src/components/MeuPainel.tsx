'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageTitle, Metric, brl } from '@/components/ui';

interface Soma { valor: number; faturas: number }
interface Painel {
  mesDesde: string;
  clientes: number;
  clientesComVencida: number;
  vencidoEmAberto: Soma;
  recuperadoNoMes: { regua: Soma; manual: Soma; semContato: Soma };
  contatosManuaisNoMes: number;
  promessasEmVigor: { id: string; nome: string; promessaAte: string }[];
  promessasNaoCumpridas: { id: string; nome: string; promessaAte: string }[];
  maisAtrasados: { invoiceId: string; customerId: string; nome: string; valor: number; vencimento: string }[];
}

const data = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
const dias = (s: string) => Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 86400000));

/** Dashboard do operador: só os números dele (crédito e clientes sob sua responsabilidade). */
export function MeuPainel({ nome }: { nome?: string }) {
  const [p, setP] = useState<Painel | null>(null);
  useEffect(() => { api<Painel>('/recuperacao/meu-painel').then(setP).catch(() => {}); }, []);
  if (!p) return <div className="text-sm text-muted">Carregando…</div>;
  const recuperado = p.recuperadoNoMes.regua.valor + p.recuperadoNoMes.manual.valor;

  return (
    <div>
      <PageTitle title={nome ? `Olá, ${nome.split(' ')[0]}` : 'Meu painel'} subtitle="Só os seus números: clientes sob sua responsabilidade e o que você recuperou neste mês." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Meus clientes" value={`${p.clientes}`} />
        <Metric label="Com fatura vencida" value={`${p.clientesComVencida}`} accent="#A32D2D" />
        <Metric label="Vencido em aberto" value={brl(p.vencidoEmAberto.valor)} accent="#A32D2D" />
        <Metric label="Recuperado no mês (meu crédito)" value={brl(recuperado)} accent="#0F6E56" />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
          <div className="text-xs text-muted">Recuperado pela régua</div>
          <div className="tabular text-lg font-semibold text-ink">{brl(p.recuperadoNoMes.regua.valor)}</div>
          <div className="text-[11px] text-muted">{p.recuperadoNoMes.regua.faturas} fatura(s) dos seus clientes</div>
        </div>
        <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
          <div className="text-xs text-muted">Recuperado no seu contato manual</div>
          <div className="tabular text-lg font-semibold text-ink">{brl(p.recuperadoNoMes.manual.valor)}</div>
          <div className="text-[11px] text-muted">{p.recuperadoNoMes.manual.faturas} fatura(s)</div>
        </div>
        <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
          <div className="text-xs text-muted">Seus contatos manuais no mês</div>
          <div className="tabular text-lg font-semibold text-ink">{p.contatosManuaisNoMes}</div>
          <div className="text-[11px] text-muted">mensagens e conversas no chat NX</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-ink">Mais atrasados</h2>
          {p.maisAtrasados.length === 0 && <p className="text-sm text-muted">Nenhum cliente seu com fatura vencida. 🎉</p>}
          {p.maisAtrasados.map((i) => (
            <Link key={i.invoiceId} href={`/clientes/${i.customerId}`} className="flex items-center justify-between border-b border-line py-1.5 text-sm last:border-0 hover:text-primary">
              <span className="truncate">{i.nome}</span>
              <span className="tabular shrink-0 text-xs text-muted">{brl(i.valor)} · <span className="text-danger">{dias(i.vencimento)}d</span></span>
            </Link>
          ))}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-ink">Promessas em vigor</h2>
          {p.promessasEmVigor.length === 0 && <p className="text-sm text-muted">Nenhuma promessa aguardando.</p>}
          {p.promessasEmVigor.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between border-b border-line py-1.5 text-sm last:border-0 hover:text-primary">
              <span className="truncate">{c.nome}</span><span className="shrink-0 text-xs font-medium text-danger">até {data(c.promessaAte)}</span>
            </Link>
          ))}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-ink">Promessas não cumpridas</h2>
          {p.promessasNaoCumpridas.length === 0 && <p className="text-sm text-muted">Nenhuma nos últimos 7 dias.</p>}
          {p.promessasNaoCumpridas.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between border-b border-line py-1.5 text-sm last:border-0 hover:text-primary">
              <span className="truncate">{c.nome}</span><span className="shrink-0 text-xs text-[#854F0B]">prometeu {data(c.promessaAte)}</span>
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">Recuperado = faturas pagas cujo crédito é seu (você é a responsável pelo cliente). Contato manual: o último contato antes do pagamento foi seu.</p>
    </div>
  );
}
