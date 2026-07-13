'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle, brl } from '@/components/ui';

interface Sub {
  id: string;
  plano: string;
  valor: number;
  ciclo: string;
  metodo: string;
  diaVenc: number;
  status: string;
  proximaCobranca?: string;
  customer?: { nome: string };
}
interface Customer { id: string; nome: string }

const statusColor: Record<string, string> = {
  ATIVA: 'bg-success-tint text-[#0F6E56]',
  INADIMPLENTE: 'bg-danger-tint text-[#A32D2D]',
  PAUSADA: 'bg-warning-tint text-[#854F0B]',
  CANCELADA: 'bg-canvas text-muted',
};

export default function AssinaturasPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showNovo, setShowNovo] = useState(false);
  const [f, setF] = useState({ customerId: '', plano: '', valor: '', ciclo: 'MENSAL', metodo: 'PIX_AUTOMATICO', diaVenc: '10' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setSubs(await api<Sub[]>('/assinaturas').catch(() => []));
    setCustomers(await api<Customer[]>('/clientes').catch(() => []));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function criar() {
    setMsg('Salvando...');
    try {
      await api('/assinaturas', { method: 'POST', body: { ...f, valor: Number(f.valor), diaVenc: Number(f.diaVenc) } });
      setShowNovo(false);
      setF({ customerId: '', plano: '', valor: '', ciclo: 'MENSAL', metodo: 'PIX_AUTOMATICO', diaVenc: '10' });
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  }
  async function mudarStatus(id: string, status: string) {
    await api(`/assinaturas/${id}/status`, { method: 'PATCH', body: { status } });
    load();
  }

  return (
    <div>
      <PageTitle title="Assinaturas" subtitle="Recorrência com Pix Automático e retentativa" />

      <button onClick={() => setShowNovo((s) => !s)} className="mb-4 flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Nova assinatura</button>

      {showNovo && (
        <div className="mb-4 rounded-lg border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="">Cliente</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input placeholder="Plano" value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <input placeholder="Valor" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <select value={f.ciclo} onChange={(e) => setF({ ...f, ciclo: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
              {['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'SEMANAL'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="PIX_AUTOMATICO">Pix Automático</option>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="CARTAO">Cartão</option>
            </select>
            <input placeholder="Dia venc." value={f.diaVenc} onChange={(e) => setF({ ...f, diaVenc: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <button onClick={criar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Criar</button>
          </div>
          {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-3 font-medium">Cliente / Plano</th><th className="px-4 py-3 font-medium">Valor</th><th className="px-4 py-3 font-medium">Ciclo</th><th className="px-4 py-3 font-medium">Próxima</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Ações</th></tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><div className="font-medium text-ink">{s.customer?.nome}</div><div className="text-xs text-muted">{s.plano} · {s.metodo === 'PIX_AUTOMATICO' ? 'Pix Auto' : s.metodo}</div></td>
                <td className="tabular px-4 py-3">{brl(Number(s.valor))}</td>
                <td className="px-4 py-3 text-muted">{s.ciclo}</td>
                <td className="px-4 py-3 text-muted">{s.proximaCobranca ? new Date(s.proximaCobranca).toLocaleDateString('pt-BR') : '—'}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[s.status]}`}>{s.status}</span></td>
                <td className="px-4 py-3">
                  {s.status !== 'CANCELADA' && (
                    <div className="flex gap-1">
                      {s.status === 'PAUSADA' ? (
                        <button onClick={() => mudarStatus(s.id, 'ATIVA')} className="rounded border border-line px-2 py-1 text-xs hover:bg-canvas">Ativar</button>
                      ) : (
                        <button onClick={() => mudarStatus(s.id, 'PAUSADA')} className="rounded border border-line px-2 py-1 text-xs hover:bg-canvas">Pausar</button>
                      )}
                      <button onClick={() => mudarStatus(s.id, 'CANCELADA')} className="rounded border border-line px-2 py-1 text-xs text-danger hover:bg-danger-tint">Cancelar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {subs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhuma assinatura.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
