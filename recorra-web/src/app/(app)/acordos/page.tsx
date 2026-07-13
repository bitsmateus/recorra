'use client';

import { useEffect, useState, useCallback } from 'react';
import { Handshake } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';

interface Customer { id: string; nome: string }
interface Invoice { id: string; valor: number; vencimento: string; customerId: string }
interface Installment { numero: number; valor: number; vencimento: string; status: string }
interface Agreement {
  id: string;
  valorOriginal: number;
  descontoPct: number;
  valorAcordado: number;
  parcelas: number;
  status: string;
  customer?: { nome: string };
  installments: Installment[];
}

export default function AcordosPage() {
  const [acordos, setAcordos] = useState<Agreement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vencidas, setVencidas] = useState<Invoice[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [desconto, setDesconto] = useState('0');
  const [parcelas, setParcelas] = useState('3');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setAcordos(await api<Agreement[]>('/acordos').catch(() => []));
    setCustomers(await api<Customer[]>('/clientes').catch(() => []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const carregarVencidas = useCallback(async (cid: string) => {
    setSelecionadas([]);
    if (!cid) return setVencidas([]);
    const inv = await api<Invoice[]>(`/cobrancas?status=VENCIDA&customerId=${cid}`).catch(() => []);
    setVencidas(inv);
  }, []);

  useEffect(() => { carregarVencidas(customerId); }, [customerId, carregarVencidas]);

  const totalSel = vencidas.filter((v) => selecionadas.includes(v.id)).reduce((s, v) => s + Number(v.valor), 0);
  const valorAcordado = totalSel * (1 - Number(desconto) / 100);

  async function criar() {
    if (!customerId || selecionadas.length === 0) return setMsg('Selecione cliente e faturas.');
    setMsg('Criando acordo...');
    try {
      await api('/acordos', { method: 'POST', body: { customerId, faturaIds: selecionadas, descontoPct: Number(desconto), parcelas: Number(parcelas) } });
      setMsg('✓ Acordo criado');
      setCustomerId(''); setVencidas([]); setSelecionadas([]);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  }

  return (
    <div>
      <PageTitle title="Acordos" subtitle="Renegociação de dívida com desconto e parcelamento" />

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink"><Handshake size={16} /> Novo acordo</h2>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mb-3 w-full max-w-xs rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">Selecione o cliente</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        {vencidas.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-xs text-muted">Faturas vencidas:</p>
            {vencidas.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selecionadas.includes(v.id)} onChange={(e) => setSelecionadas((s) => e.target.checked ? [...s, v.id] : s.filter((x) => x !== v.id))} />
                {brl(Number(v.valor))} · venc. {new Date(v.vencimento).toLocaleDateString('pt-BR')}
              </label>
            ))}
          </div>
        )}
        {customerId && vencidas.length === 0 && <p className="mb-3 text-sm text-muted">Sem faturas vencidas para este cliente.</p>}

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Desconto (%)</span><input value={desconto} onChange={(e) => setDesconto(e.target.value)} className="w-24 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Parcelas</span><input value={parcelas} onChange={(e) => setParcelas(e.target.value)} className="w-24 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" /></label>
          <div className="text-sm text-muted">Original: <b className="text-ink">{brl(totalSel)}</b> → Acordado: <b className="text-primary">{brl(valorAcordado)}</b></div>
          <button onClick={criar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Criar acordo</button>
        </div>
        {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
      </div>

      <div className="space-y-3">
        {acordos.map((a) => (
          <div key={a.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium text-ink">{a.customer?.nome}</div>
              <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-medium text-primary">{a.status}</span>
            </div>
            <div className="text-sm text-muted">{brl(Number(a.valorOriginal))} → {brl(Number(a.valorAcordado))} ({Number(a.descontoPct)}% desc.) em {a.parcelas}x</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.installments.map((p) => (
                <span key={p.numero} className="rounded bg-canvas px-2 py-1 text-xs text-muted">{p.numero}. {brl(Number(p.valor))} · {new Date(p.vencimento).toLocaleDateString('pt-BR')}</span>
              ))}
            </div>
          </div>
        ))}
        {acordos.length === 0 && <p className="text-sm text-muted">Nenhum acordo ainda.</p>}
      </div>
    </div>
  );
}
