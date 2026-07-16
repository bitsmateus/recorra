'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, MapPin, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Metric, RiskBadge, brl } from '@/components/ui';

interface Detalhe {
  customer: { id: string; nome: string; doc: string; email?: string; telefone?: string; plano?: string; valorPlano?: number; cidade?: string; uf?: string; tags?: string[]; contrato?: string };
  risco?: { faixa: string; score: number; fatores?: { fator: string; pontos: number; detalhe: string }[] };
  features?: { atrasosQtd: number; atrasoMedioDias: number; faturasPagas: number; faturasVencidas: number; taxaResposta: number };
  faturas: { id: string; valor: number; vencimento: string; status: string; metodo: string; origem?: string; pixCopiaCola?: string; linkPagamento?: string }[];
  disparos: { id: string; canal: string; conteudo?: string; status: string; createdAt: string }[];
  acordos: { id: string; valorOriginal: number; valorAcordado: number; parcelas: number; status: string }[];
  assinaturas: { id: string; plano: string; valor: number; ciclo: string; status: string; proximaCobranca?: string }[];
  totais: { emAberto: number; pago: number; vencidas: number };
}
interface Gateway { id: string; provider: string; apelido?: string; ambiente?: string }

const statusColor: Record<string, string> = {
  PENDENTE: 'bg-warning-tint text-[#854F0B]', VENCIDA: 'bg-danger-tint text-[#A32D2D]', PAGA: 'bg-success-tint text-[#0F6E56]',
  CANCELADA: 'bg-canvas text-muted', ENVIADO: 'bg-success-tint text-[#0F6E56]', ENTREGUE: 'bg-success-tint text-[#0F6E56]',
  FALHA: 'bg-danger-tint text-[#A32D2D]', FILA: 'bg-warning-tint text-[#854F0B]', IGNORADO: 'bg-canvas text-muted', LIDO: 'bg-primary-tint text-primary',
};
const canalLabel: Record<string, string> = { WHATSAPP_CLOUD: 'WhatsApp', WHATSAPP_EVOLUTION: 'WhatsApp', WHATSAPP_UAZAPI: 'WhatsApp', EMAIL: 'E-mail', SMS: 'SMS' };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export default function ClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState('');
  const [cobrar, setCobrar] = useState(false);

  function carregar() { api<Detalhe>(`/clientes/${id}/detalhe`).then(setD).catch((e) => setErro(e.message)); }
  useEffect(() => { carregar(); }, [id]);

  if (erro) return <div><Link href="/clientes" className="text-sm text-primary">← Voltar</Link><p className="mt-4 text-sm text-danger">{erro}</p></div>;
  if (!d) return <p className="text-sm text-muted">Carregando...</p>;
  const c = d.customer;

  return (
    <div>
      <Link href="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft size={16} /> Voltar para clientes</Link>

      <div className="mb-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{c.nome}</h1>
            <div className="mt-1 tabular text-sm text-muted">{c.doc}{c.contrato ? ` · contrato ${c.contrato}` : ''}</div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
              {c.telefone && <span className="flex items-center gap-1"><Phone size={14} /> {c.telefone}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail size={14} /> {c.email}</span>}
              {(c.cidade || c.uf) && <span className="flex items-center gap-1"><MapPin size={14} /> {[c.cidade, c.uf].filter(Boolean).join(' / ')}</span>}
              {c.plano && <span>Plano: <b className="text-ink">{c.plano}</b>{c.valorPlano ? ` (${brl(Number(c.valorPlano))})` : ''}</span>}
            </div>
            {c.tags && c.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded-full bg-primary-tint px-2 py-0.5 text-xs text-primary">{t}</span>)}</div>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <RiskBadge faixa={d.risco?.faixa} />
            <button onClick={() => setCobrar(true)} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Gerar cobrança</button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Metric label="Em aberto" value={brl(d.totais.emAberto)} accent={d.totais.emAberto > 0 ? '#EF4444' : undefined} />
        <Metric label="Total pago" value={brl(d.totais.pago)} accent="#0F6E56" />
        <Metric label="Faturas vencidas" value={String(d.totais.vencidas)} accent={d.totais.vencidas > 0 ? '#F0A93B' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Faturas (${d.faturas.length})`}>
          <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <tbody>
              {d.faturas.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="tabular px-2 py-2 font-medium">{brl(Number(f.valor))}</td>
                  <td className="px-2 py-2 text-muted">{new Date(f.vencimento).toLocaleDateString('pt-BR')}</td>
                  <td className="px-2 py-2 text-muted">{f.metodo}{f.pixCopiaCola ? ' · Pix ✓' : ''}</td>
                  <td className="px-2 py-2 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[f.status] || 'bg-canvas text-muted'}`}>{f.status}</span></td>
                </tr>
              ))}
              {d.faturas.length === 0 && <tr><td className="px-2 py-4 text-center text-muted">Nenhuma fatura.</td></tr>}
            </tbody>
          </table></div>
        </Card>

        <Card title={`Histórico de disparos (${d.disparos.length})`}>
          <div className="max-h-96 overflow-auto">
            {d.disparos.map((m) => (
              <div key={m.id} className="border-b border-line px-2 py-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">{canalLabel[m.canal] || m.canal} · {new Date(m.createdAt).toLocaleString('pt-BR')}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[m.status] || 'bg-canvas text-muted'}`}>{m.status}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-sm text-ink">{m.conteudo}</div>
              </div>
            ))}
            {d.disparos.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhum disparo.</p>}
          </div>
        </Card>

        <Card title={`Acordos (${d.acordos.length})`}>
          {d.acordos.map((a) => (
            <div key={a.id} className="border-b border-line px-2 py-2 text-sm last:border-0">
              {brl(Number(a.valorOriginal))} → <b className="text-primary">{brl(Number(a.valorAcordado))}</b> em {a.parcelas}x <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{a.status}</span>
            </div>
          ))}
          {d.acordos.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhum acordo.</p>}
        </Card>

        <Card title={`Assinaturas (${d.assinaturas.length})`}>
          {d.assinaturas.map((s) => (
            <div key={s.id} className="border-b border-line px-2 py-2 text-sm last:border-0">
              <b>{s.plano}</b> · {brl(Number(s.valor))}/{s.ciclo.toLowerCase()} <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{s.status}</span>
              {s.proximaCobranca && <span className="ml-2 text-xs text-muted">próx.: {new Date(s.proximaCobranca).toLocaleDateString('pt-BR')}</span>}
            </div>
          ))}
          {d.assinaturas.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">Nenhuma assinatura.</p>}
        </Card>
      </div>

      {d.risco?.fatores && d.risco.fatores.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 text-sm font-semibold text-ink">Por que este cliente é {d.risco.faixa} (score {d.risco.score})</div>
          <div className="space-y-1">
            {d.risco.fatores.map((fa, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted">{fa.detalhe}</span>
                <span className={fa.pontos >= 0 ? 'text-danger' : 'text-success'}>{fa.pontos >= 0 ? '+' : ''}{fa.pontos}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cobrar && <ChargeModal customerId={c.id} valorSugerido={c.valorPlano} onClose={() => setCobrar(false)} onSaved={() => { setCobrar(false); carregar(); }} />}
    </div>
  );
}

function ChargeModal({ customerId, valorSugerido, onClose, onSaved }: { customerId: string; valorSugerido?: number; onClose: () => void; onSaved: () => void }) {
  const hoje = new Date();
  const venc = new Date(hoje.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [f, setF] = useState({ valor: valorSugerido ? String(valorSugerido) : '', vencimento: venc, descricao: '', accountId: '', metodo: 'PIX' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api<Gateway[]>('/config/gateways').then(setGateways).catch(() => setGateways([])); }, []);

  async function salvar() {
    setSaving(true); setMsg('');
    try {
      await api('/cobrancas/fatura', { method: 'POST', body: {
        customerId, valor: Number(f.valor), vencimento: f.vencimento, descricao: f.descricao || undefined,
        accountId: f.accountId || undefined, metodo: f.metodo,
      } });
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Gerar cobrança</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor (R$) *</span><input value={f.valor} onChange={(e) => set('valor', e.target.value)} placeholder="99.90" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Vencimento *</span><input type="date" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Descrição</span><input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Mensalidade" className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Gateway</span>
              <select value={f.accountId} onChange={(e) => set('accountId', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
                <option value="">Só registrar (sem Pix)</option>
                {gateways.map((g) => <option key={g.id} value={g.id}>{g.apelido || g.provider}{g.ambiente ? ` · ${g.ambiente}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Método</span>
              <select value={f.metodo} onChange={(e) => set('metodo', e.target.value)} className="w-full rounded border border-line px-3 py-2 outline-none focus:border-primary">
                <option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARTAO">Cartão</option>
              </select>
            </label>
          </div>
          {gateways.length === 0 && <p className="text-xs text-warning">Nenhum gateway configurado. A fatura será só registrada. Configure em Integrações para emitir o Pix.</p>}
        </div>
        {msg && <p className="mt-3 text-sm text-danger">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'Gerando...' : 'Gerar'}</button>
        </div>
      </div>
    </div>
  );
}
