'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';
import { adminApi, getAdminToken, clearAdminToken } from '@/lib/adminApi';
import { Logo } from '@/components/Logo';
import { Metric, brl } from '@/components/ui';

type Tab = 'dashboard' | 'relatorios' | 'tenants' | 'financeiro' | 'planos' | 'tutoriais' | 'admins';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'planos', label: 'Planos' },
  { id: 'tutoriais', label: 'Tutoriais' },
  { id: 'admins', label: 'Admins' },
];

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    else setReady(true);
  }, [router]);
  if (!ready) return null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-surface px-8 py-4">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-white">Plataforma</span>
        </div>
        <button onClick={() => { clearAdminToken(); router.replace('/admin/login'); }} className="flex items-center gap-2 text-sm text-muted hover:text-ink">
          <LogOut size={16} /> Sair
        </button>
      </header>

      <div className="border-b border-line bg-surface px-8">
        <div className="mx-auto flex max-w-6xl gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-6xl p-8">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'relatorios' && <RelatoriosTab />}
        {tab === 'tenants' && <TenantsTab />}
        {tab === 'financeiro' && <FinanceiroTab />}
        {tab === 'planos' && <PlanosTab />}
        {tab === 'tutoriais' && <TutoriaisTab />}
        {tab === 'admins' && <AdminsTab />}
      </main>
    </div>
  );
}

/** Barras mensais reutilizável (1 ou 2 séries). SVG, sem lib. */
function BarChart({ titulo, sub, dados, series, fmt }: {
  titulo: string; sub?: string; dados: any[];
  series: { key: string; cor: string; nome: string }[];
  fmt: (n: number) => string;
}) {
  const w = 720, h = 220, padX = 40, padTop = 12, padBottom = 28;
  const max = Math.max(1, ...dados.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const n = dados.length || 1;
  const slot = (w - padX * 2) / n;
  const bw = Math.min(slot / (series.length + 0.5), 26);
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{titulo}</h3>
        {series.length > 1 && (
          <div className="flex gap-3 text-xs text-muted">
            {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>)}
          </div>
        )}
      </div>
      {sub && <p className="mb-2 text-xs text-muted">{sub}</p>}
      {dados.length === 0 ? <p className="py-12 text-center text-sm text-muted">Sem dados.</p> : (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full min-w-[560px]">
            {dados.map((d, i) => {
              const x0 = padX + i * slot + (slot - bw * series.length) / 2;
              return (
                <g key={i}>
                  {series.map((s, si) => {
                    const v = Number(d[s.key]) || 0;
                    const topo = y(v);
                    return <rect key={s.key} x={x0 + si * bw} y={topo} width={Math.max(1, bw - 2)} height={Math.max(0, h - padBottom - topo)} rx={2} fill={s.cor}><title>{`${d.label}: ${fmt(v)}`}</title></rect>;
                  })}
                  <text x={padX + i * slot + slot / 2} y={h - padBottom + 14} textAnchor="middle" className="fill-muted text-[10px]">{d.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function RelatoriosTab() {
  const [fin, setFin] = useState<any>(null);
  const [disp, setDisp] = useState<any>(null);
  useEffect(() => {
    adminApi('/admin/relatorios/financeiro').then(setFin).catch(() => {});
    adminApi('/admin/relatorios/disparos').then(setDisp).catch(() => {});
  }, []);
  const nf = (n: number) => Number(n).toLocaleString('pt-BR');
  const canalLabel: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', SMS: 'SMS', HTTP_GENERIC: 'HTTP', NX_SYSTEMS: 'NX' };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Financeiro &amp; implementações</h2>
        {fin && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="MRR" value={brl(fin.mrr)} accent="#14857C" />
            <Metric label="Tenants ativos" value={nf(fin.tenantsAtivos)} accent="#0F6E56" />
            <Metric label="Total de tenants" value={nf(fin.tenantsTotal)} />
            <Metric label="Implementados (live)" value={nf(fin.implementados)} accent="#0F6E56" />
          </div>
        )}
        {fin && <BarChart titulo="Receita por mês" sub="Faturas da plataforma emitidas x recebidas" dados={fin.receitaMensal} series={[{ key: 'faturado', cor: '#94A3B8', nome: 'Faturado' }, { key: 'recebido', cor: '#14857C', nome: 'Recebido' }]} fmt={brl} />}
        {fin && <BarChart titulo="Novos tenants por mês" sub="Implementações (assinaturas iniciadas)" dados={fin.novosTenants} series={[{ key: 'novos', cor: '#14857C', nome: 'Novos' }]} fmt={nf} />}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Disparos da plataforma</h2>
        {disp && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Total de disparos" value={nf(disp.total)} />
            {disp.porCanal?.slice(0, 3).map((c: any) => <Metric key={c.canal} label={canalLabel[c.canal] ?? c.canal} value={nf(c.total)} />)}
          </div>
        )}
        {disp && <BarChart titulo="Disparos por mês" dados={disp.porMes} series={[{ key: 'total', cor: '#14857C', nome: 'Disparos' }]} fmt={nf} />}
        {disp && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-medium text-ink">Ranking de tenants por disparos</h3>
            <div className="w-full overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-muted"><tr><th className="py-2 font-medium">#</th><th className="py-2 font-medium">Tenant</th><th className="py-2 text-right font-medium">Disparos</th></tr></thead>
              <tbody>
                {disp.rankingTenants?.map((r: any, i: number) => (
                  <tr key={r.tenantId} className="border-b border-line last:border-0">
                    <td className="py-2 text-muted">{i + 1}</td>
                    <td className="py-2 font-medium text-ink">{r.nome}</td>
                    <td className="tabular py-2 text-right">{nf(r.disparos)}</td>
                  </tr>
                ))}
                {(!disp.rankingTenants || disp.rankingTenants.length === 0) && <tr><td colSpan={3} className="py-6 text-center text-muted">Sem disparos ainda.</td></tr>}
              </tbody>
            </table></div>
          </div>
        )}
        {disp && disp.porStatus?.length > 0 && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-2 text-sm font-medium text-ink">Por status</h3>
            <div className="flex flex-wrap gap-2">
              {disp.porStatus.map((s: any) => <span key={s.status} className="rounded-full bg-canvas px-3 py-1 text-xs text-ink">{s.status}: <span className="font-medium">{nf(s.total)}</span></span>)}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardTab() {
  const [m, setM] = useState<any>(null);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    adminApi('/admin/metrics').then(setM).catch(() => {});
    adminApi('/admin/financeiro').then(setF).catch(() => {});
  }, []);
  return (
    <div className="space-y-6">
      {m && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Metric label="Tenants" value={String(m.tenants)} />
          <Metric label="Ativos" value={String(m.tenantsAtivos)} accent="#0F6E56" />
          <Metric label="Clientes" value={Number(m.clientes).toLocaleString('pt-BR')} />
          <Metric label="Disparos" value={Number(m.disparos).toLocaleString('pt-BR')} />
          <Metric label="Recuperado (tenants)" value={brl(m.recuperadoTotal)} accent="#14857C" />
        </div>
      )}
      {f && (
        <>
          <h2 className="text-sm font-semibold text-ink">Financeiro do SaaS</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="MRR estimado" value={brl(f.mrr)} accent="#14857C" />
            <Metric label="Faturado" value={brl(f.faturado)} />
            <Metric label="Recebido" value={brl(f.recebido)} accent="#0F6E56" />
            <Metric label="Em aberto" value={brl(f.aberto)} accent="#F0A93B" />
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 text-sm font-medium text-ink">Tenants por plano</div>
            <div className="flex flex-wrap gap-2">
              {f.porPlano?.map((p: any) => <span key={p.plano} className="rounded-full bg-primary-tint px-3 py-1 text-xs text-primary">{p.plano}: {p.tenants}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TenantsTab() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const tiersLegado = ['TRIAL', 'NOTIFICADOR', 'ESSENCIAL', 'PROFISSIONAL', 'ESCALA', 'ENTERPRISE'];
  const [planosDb, setPlanosDb] = useState<any[]>([]);
  const load = useCallback(() => { adminApi<any[]>('/admin/tenants').then(setTenants).catch(() => {}); }, []);
  useEffect(load, [load]);
  // Só os planos reais da tabela (editáveis) podem ser vinculados via planId.
  useEffect(() => { adminApi<any[]>('/admin/planos').then((ps) => setPlanosDb(ps.filter((p) => p.editavel))).catch(() => {}); }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Tenants</h2>
        <button onClick={() => setNovo((v) => !v)} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Novo tenant</button>
      </div>
      {novo && <NovoTenant onDone={() => { setNovo(false); load(); }} />}
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Uso</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><div className="font-medium text-ink">{t.nome}</div><div className="text-xs text-muted">{t.cnpj || '—'}</div></td>
                <td className="px-4 py-3">
                  {planosDb.length > 0 ? (
                    <select value={t.planId ?? ''} onChange={async (e) => { await adminApi(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { planId: e.target.value || null } }); load(); }} className="rounded border border-line px-2 py-1 text-xs">
                      <option value="">— (legado: {t.plano})</option>
                      {planosDb.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  ) : (
                    <select value={t.plano} onChange={async (e) => { await adminApi(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { plano: e.target.value } }); load(); }} className="rounded border border-line px-2 py-1 text-xs">{tiersLegado.map((p) => <option key={p}>{p}</option>)}</select>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{t.uso.clientes} cli · {t.uso.faturas} fat · {t.uso.disparos} disp</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={async () => { await adminApi(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { ativo: !t.ativo } }); load(); }} className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.ativo ? 'bg-success-tint text-[#0F6E56]' : 'bg-danger-tint text-[#A32D2D]'}`}>{t.ativo ? 'Ativo' : 'Suspenso'}</button>
                    <button onClick={() => setDetalhe(detalhe === t.id ? null : t.id)} className="rounded border border-line px-2 py-1 text-xs hover:bg-canvas">Detalhes</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {detalhe && <TenantDetalhe tenantId={detalhe} onChange={load} />}
    </div>
  );
}

function TenantDetalhe({ tenantId, onChange }: { tenantId: string; onChange: () => void }) {
  const [d, setD] = useState<any>(null);
  const [h, setH] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    adminApi(`/admin/tenants/${tenantId}/detalhe`).then(setD).catch(() => {});
    adminApi(`/admin/tenants/${tenantId}/saude`).then(setH).catch(() => {});
  }, [tenantId]);
  useEffect(load, [load]);
  if (!d) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{d.tenant.nome}</h3>
        <div className="flex gap-2">
          <button onClick={async () => { const f = await adminApi<any>(`/admin/tenants/${tenantId}/faturas/gerar`, { method: 'POST', body: {} }); setMsg(`Fatura: R$ ${Number(f.valorTotal).toFixed(2)}`); }} className="rounded border border-line px-3 py-1 text-xs hover:bg-canvas">Gerar fatura</button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <div><span className="text-muted">Clientes: </span><b>{d.uso.clientes}</b></div>
        <div><span className="text-muted">Faturas: </span><b>{d.uso.faturas}</b></div>
        <div><span className="text-muted">Disparos: </span><b>{d.uso.disparos}</b></div>
        <div><span className="text-muted">Recuperado: </span><b>{brl(d.uso.recuperado)}</b></div>
      </div>
      {h && h.anomalias?.length > 0 && <div className="mb-2 space-y-1">{h.anomalias.map((a: any, i: number) => <p key={i} className={a.severidade === 'critico' ? 'text-sm text-danger' : 'text-sm text-[#854F0B]'}>⚠ {a.mensagem}</p>)}</div>}
      <div className="text-xs text-muted">Usuários: {d.usuarios.map((u: any) => `${u.nome} (${u.role})`).join(', ')}</div>
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
    </div>
  );
}

function NovoTenant({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ empresa: '', cnpj: '', nome: '', email: '', senha: '' });
  const [msg, setMsg] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {['empresa', 'cnpj', 'nome', 'email', 'senha'].map((k) => (
          <input key={k} placeholder={k} type={k === 'senha' ? 'password' : 'text'} value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
        ))}
        <button onClick={async () => { try { await adminApi('/admin/tenants', { method: 'POST', body: f }); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); } }} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Criar</button>
      </div>
      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
    </div>
  );
}

function AsaasConfig() {
  const [cfg, setCfg] = useState<any>(null);
  const [form, setForm] = useState({ ambiente: 'sandbox', apiKey: '', webhookToken: '' });
  const [msg, setMsg] = useState('');
  const [aberto, setAberto] = useState(false);
  const load = useCallback(() => { adminApi<any>('/admin/asaas/config').then((c) => { setCfg(c); if (c?.ambiente) setForm((f) => ({ ...f, ambiente: c.ambiente })); }).catch(() => {}); }, []);
  useEffect(load, [load]);
  // O webhook fica FORA do prefixo /api (excluído em main.ts), então tira o /api do fim.
  const webhookUrl = `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')}/webhooks/plataforma/asaas`;

  async function salvar() {
    try { await adminApi('/admin/asaas/config', { method: 'PUT', body: form }); setMsg('✓ Salvo'); setForm((f) => ({ ...f, apiKey: '', webhookToken: '' })); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  }

  return (
    <div className="mb-6 rounded-lg border border-line bg-surface p-4">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-ink">Cobrança automática (Asaas)</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${cfg?.configurado ? 'bg-success-tint text-[#0F6E56]' : 'bg-canvas text-muted'}`}>{cfg?.configurado ? `conectado · ${cfg.ambiente}` : 'não configurado'}</span>
      </button>
      {aberto && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs text-muted">Ambiente
              <select value={form.ambiente} onChange={(e) => setForm({ ...form, ambiente: e.target.value })} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"><option value="sandbox">Sandbox</option><option value="production">Produção</option></select>
            </label>
            <label className="text-xs text-muted">API Key do Asaas<input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={cfg?.configurado ? '•••• (deixe em branco p/ manter)' : 'sua chave'} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
            <label className="text-xs text-muted">Webhook token (opcional)<input value={form.webhookToken} onChange={(e) => setForm({ ...form, webhookToken: e.target.value })} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          </div>
          <p className="mt-3 text-xs text-muted">No painel do Asaas, cadastre o webhook apontando para:<br /><code className="break-all text-ink">{webhookUrl}</code></p>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Salvar Asaas</button>
            {msg && <span className="text-sm text-primary">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceiroTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { adminApi<any[]>('/admin/faturas').then(setRows).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function cobrar(id: string) {
    setBusy(id); setMsg('');
    try { await adminApi(`/admin/faturas/${id}/cobrar`, { method: 'POST', body: {} }); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao cobrar'); }
    finally { setBusy(null); }
  }
  async function sincronizar(id: string) {
    setBusy(id);
    try { await adminApi(`/admin/faturas/${id}/sincronizar`, { method: 'POST', body: {} }); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Faturas do SaaS</h2>
        <button onClick={async () => { await adminApi('/admin/faturas/fechar-mes', { method: 'POST', body: {} }); load(); }} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Fechar mês (gerar faturas)</button>
      </div>
      <AsaasConfig />
      {msg && <p className="mb-3 text-sm text-danger">{msg}</p>}
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Cobrança (Asaas)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.tenantNome}</td>
                <td className="px-4 py-3 text-muted">{r.competencia}</td>
                <td className="tabular px-4 py-3">{brl(Number(r.valorTotal))}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'paga' ? 'bg-success-tint text-[#0F6E56]' : r.status === 'cobrada' ? 'bg-primary-tint text-primary' : 'bg-warning-tint text-[#854F0B]'}`}>{r.status === 'paga' ? 'Paga' : r.status === 'cobrada' ? 'Cobrada' : 'Em aberto'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {!r.asaasPaymentId && r.status !== 'paga' && <button disabled={busy === r.id} onClick={() => cobrar(r.id)} className="rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50">{busy === r.id ? '...' : 'Gerar cobrança'}</button>}
                    {r.linkPagamento && <a href={r.linkPagamento} target="_blank" rel="noopener noreferrer" className="rounded border border-line px-3 py-1 text-xs text-primary hover:bg-canvas">Abrir link</a>}
                    {r.asaasPaymentId && r.status !== 'paga' && <button disabled={busy === r.id} onClick={() => sincronizar(r.id)} className="rounded border border-line px-3 py-1 text-xs hover:bg-canvas disabled:opacity-50">Sincronizar</button>}
                    <button onClick={async () => { await adminApi(`/admin/faturas/${r.id}/pagar`, { method: 'PATCH', body: { paga: r.status !== 'paga' } }); load(); }} className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-canvas" title="Marcar manualmente">{r.status === 'paga' ? 'Reabrir' : 'Marcar paga'}</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma fatura. Use "Fechar mês".</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

const FEATURES_PLANO = ['cobranca', 'ia_risco', 'reguas_por_risco', 'ia_completa', 'multi_gateway', 'api_ingestao'];
const PLANO_VAZIO = { nome: '', preco: 0, sobConsulta: false, maxClientes: -1, disparosInclusos: 0, custoExcedente: 0, maxUsuarios: -1, features: [] as string[], ativo: true, ordem: 0 };

function PlanosTab() {
  const [planos, setPlanos] = useState<any[]>([]);
  const [form, setForm] = useState<any>(PLANO_VAZIO);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { adminApi<any[]>('/admin/planos').then(setPlanos).catch(() => {}); }, []);
  useEffect(load, [load]);

  const set = (k: string, v: unknown) => setForm((s: any) => ({ ...s, [k]: v }));
  const toggleFeat = (f: string) => setForm((s: any) => ({ ...s, features: s.features.includes(f) ? s.features.filter((x: string) => x !== f) : [...s.features, f] }));
  const editar = (p: any) => { setEditId(p.id); setForm({ nome: p.nome, preco: p.preco, sobConsulta: p.sobConsulta, maxClientes: p.maxClientes, disparosInclusos: p.disparosInclusos, custoExcedente: p.custoExcedente, maxUsuarios: p.maxUsuarios, features: p.features, ativo: p.ativo, ordem: p.ordem }); };
  const cancelar = () => { setEditId(null); setForm(PLANO_VAZIO); setMsg(''); };

  async function salvar() {
    if (!form.nome.trim()) return setMsg('Dê um nome ao plano.');
    try {
      if (editId) await adminApi(`/admin/planos/${editId}`, { method: 'PUT', body: form });
      else await adminApi('/admin/planos', { method: 'POST', body: form });
      cancelar(); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao salvar'); }
  }
  async function excluir(id: string) {
    try { await adminApi(`/admin/planos/${id}`, { method: 'DELETE' }); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">Planos</h2>

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 text-sm font-medium text-ink">{editId ? 'Editar plano' : 'Novo plano'}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs text-muted md:col-span-2">Nome<input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Até 1.000 clientes" className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          <label className="flex items-end gap-2 text-xs text-muted"><input type="checkbox" checked={form.sobConsulta} onChange={(e) => set('sobConsulta', e.target.checked)} className="h-4 w-4 accent-primary" /> Sob consulta (sem preço fixo)</label>
          {!form.sobConsulta && <label className="text-xs text-muted">Preço (R$/mês)<input type="number" min={0} step="0.01" value={form.preco} onChange={(e) => set('preco', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>}
          <label className="text-xs text-muted">Máx. clientes (-1 = ∞)<input type="number" value={form.maxClientes} onChange={(e) => set('maxClientes', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          <label className="text-xs text-muted">Disparos inclusos<input type="number" min={0} value={form.disparosInclusos} onChange={(e) => set('disparosInclusos', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          <label className="text-xs text-muted">Custo excedente (R$/msg)<input type="number" min={0} step="0.0001" value={form.custoExcedente} onChange={(e) => set('custoExcedente', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          <label className="text-xs text-muted">Máx. usuários (-1 = ∞)<input type="number" value={form.maxUsuarios} onChange={(e) => set('maxUsuarios', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
          <label className="text-xs text-muted">Ordem na vitrine<input type="number" value={form.ordem} onChange={(e) => set('ordem', Number(e.target.value))} className="mt-1 w-full rounded border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary" /></label>
        </div>
        <div className="mt-3">
          <span className="mb-1 block text-xs text-muted">Recursos inclusos</span>
          <div className="flex flex-wrap gap-1.5">
            {FEATURES_PLANO.map((f) => (
              <button key={f} type="button" onClick={() => toggleFeat(f)} className={`rounded-full border px-2.5 py-1 text-xs ${form.features.includes(f) ? 'border-primary bg-primary-tint text-primary' : 'border-line text-muted hover:bg-canvas'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-primary" /> Ativo</label>
          <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">{editId ? 'Salvar plano' : 'Adicionar plano'}</button>
          {editId && <button onClick={cancelar} className="text-sm text-muted">cancelar</button>}
          {msg && <span className="text-sm text-danger">{msg}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {planos.map((p) => (
          <div key={p.id} className={`rounded-lg border bg-surface p-4 ${p.ativo ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
            <div className="flex items-start justify-between">
              <div className="text-sm font-semibold text-ink">{p.nome}{!p.ativo && <span className="ml-1 text-xs font-normal text-muted">(inativo)</span>}</div>
              {p.editavel && (
                <div className="flex gap-1">
                  <button onClick={() => editar(p)} className="rounded border border-line px-2 py-0.5 text-xs hover:bg-canvas">Editar</button>
                  <button onClick={() => excluir(p.id)} className="rounded border border-line px-2 py-0.5 text-xs text-danger hover:bg-danger-tint">Excluir</button>
                </div>
              )}
            </div>
            <div className="my-1 text-2xl font-semibold text-primary">{p.sobConsulta ? 'sob consulta' : brl(p.preco)}<span className="text-xs text-muted">{p.sobConsulta ? '' : '/mês'}</span></div>
            <div className="text-xs text-muted">Até {p.maxClientes < 0 ? '∞' : p.maxClientes} clientes · {p.disparosInclusos} disparos · {p.maxUsuarios < 0 ? '∞' : p.maxUsuarios} usuários</div>
            <div className="mt-2 flex flex-wrap gap-1">{p.features.map((f: string) => <span key={f} className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">{f}</span>)}</div>
          </div>
        ))}
      </div>
      {planos.some((p) => !p.editavel) && <p className="mt-3 text-xs text-muted">Estes planos ainda vêm do código (catálogo antigo). Rode <code>npm run prisma:seed</code> uma vez para trazer as faixas para a tabela e poder editá-las.</p>}
    </div>
  );
}

function TutoriaisTab() {
  const [rows, setRows] = useState<any[]>([]);
  const vazio = { secao: 'geral', titulo: '', tipo: 'TEXTO', videoUrl: '', conteudo: '', ordem: 0, ativo: true };
  const [form, setForm] = useState<any>(vazio);
  const [editId, setEditId] = useState<string | null>(null);
  const secoes = ['geral', 'configuracoes', 'canais', 'gateways', 'integracoes', 'reguas', 'clientes', 'cobrancas'];
  const load = useCallback(() => { adminApi<any[]>('/admin/tutoriais').then(setRows).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function salvar() {
    if (editId) await adminApi(`/admin/tutoriais/${editId}`, { method: 'PUT', body: form });
    else await adminApi('/admin/tutoriais', { method: 'POST', body: form });
    setForm(vazio); setEditId(null); load();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">Tutoriais da Central de Ajuda</h2>
      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select value={form.secao} onChange={(e) => setForm({ ...form, secao: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">{secoes.map((s) => <option key={s}>{s}</option>)}</select>
          <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"><option value="TEXTO">Texto</option><option value="VIDEO">Vídeo</option></select>
        </div>
        {form.tipo === 'VIDEO' && <input placeholder="URL do vídeo (YouTube/Vimeo)" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} className="mt-3 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />}
        <textarea placeholder="Texto do passo a passo" value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} rows={3} className="mt-3 w-full rounded border border-line p-3 text-sm outline-none focus:border-primary" />
        <div className="mt-3 flex items-center gap-3">
          <input type="number" placeholder="ordem" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} className="w-24 rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <button onClick={salvar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">{editId ? 'Salvar' : 'Adicionar'}</button>
          {editId && <button onClick={() => { setForm(vazio); setEditId(null); }} className="text-sm text-muted">cancelar</button>}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded border border-line bg-surface px-3 py-2 text-sm">
            <span><b>{t.titulo}</b> <span className="text-xs text-muted">· {t.secao} · {t.tipo}</span></span>
            <div className="flex gap-2">
              <button onClick={() => { setForm({ secao: t.secao, titulo: t.titulo, tipo: t.tipo, videoUrl: t.videoUrl || '', conteudo: t.conteudo || '', ordem: t.ordem, ativo: t.ativo }); setEditId(t.id); }} className="rounded border border-line px-2 py-1 text-xs hover:bg-canvas">Editar</button>
              <button onClick={async () => { await adminApi(`/admin/tutoriais/${t.id}`, { method: 'DELETE' }); load(); }} className="rounded border border-line px-2 py-1 text-xs text-danger hover:bg-danger-tint">Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { adminApi<any[]>('/admin/admins').then(setRows).catch(() => {}); }, []);
  useEffect(load, [load]);
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">Administradores da plataforma</h2>
      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input placeholder="Senha" type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <button onClick={async () => { try { await adminApi('/admin/admins', { method: 'POST', body: f }); setF({ nome: '', email: '', senha: '' }); load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); } }} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Adicionar admin</button>
        </div>
        {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
      </div>
      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded border border-line bg-surface px-3 py-2 text-sm">
            <span><b>{a.nome}</b> <span className="text-xs text-muted">· {a.email}</span></span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${a.ativo ? 'bg-success-tint text-[#0F6E56]' : 'bg-canvas text-muted'}`}>{a.ativo ? 'ativo' : 'inativo'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
