'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plus, Check } from 'lucide-react';
import { adminApi, getAdminToken, clearAdminToken } from '@/lib/adminApi';
import { Logo } from '@/components/Logo';
import { Metric, brl } from '@/components/ui';

type Tab = 'dashboard' | 'tenants' | 'financeiro' | 'planos' | 'tutoriais' | 'admins';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
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
        {tab === 'tenants' && <TenantsTab />}
        {tab === 'financeiro' && <FinanceiroTab />}
        {tab === 'planos' && <PlanosTab />}
        {tab === 'tutoriais' && <TutoriaisTab />}
        {tab === 'admins' && <AdminsTab />}
      </main>
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
          <Metric label="Recuperado (tenants)" value={brl(m.recuperadoTotal)} accent="#0E7C7B" />
        </div>
      )}
      {f && (
        <>
          <h2 className="text-sm font-semibold text-ink">Financeiro do SaaS</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="MRR estimado" value={brl(f.mrr)} accent="#0E7C7B" />
            <Metric label="Faturado" value={brl(f.faturado)} />
            <Metric label="Recebido" value={brl(f.recebido)} accent="#0F6E56" />
            <Metric label="Em aberto" value={brl(f.aberto)} accent="#F59E0B" />
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
  const planos = ['TRIAL', 'NOTIFICADOR', 'ESSENCIAL', 'PROFISSIONAL', 'ESCALA', 'ENTERPRISE'];
  const load = useCallback(() => { adminApi<any[]>('/admin/tenants').then(setTenants).catch(() => {}); }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Tenants</h2>
        <button onClick={() => setNovo((v) => !v)} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"><Plus size={16} /> Novo tenant</button>
      </div>
      {novo && <NovoTenant onDone={() => { setNovo(false); load(); }} />}
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Uso</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><div className="font-medium text-ink">{t.nome}</div><div className="text-xs text-muted">{t.cnpj || '—'}</div></td>
                <td className="px-4 py-3">
                  <select value={t.plano} onChange={async (e) => { await adminApi(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { plano: e.target.value } }); load(); }} className="rounded border border-line px-2 py-1 text-xs">{planos.map((p) => <option key={p}>{p}</option>)}</select>
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
        </table>
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

function FinanceiroTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(() => { adminApi<any[]>('/admin/faturas').then(setRows).catch(() => {}); }, []);
  useEffect(load, [load]);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Faturas do SaaS</h2>
        <button onClick={async () => { await adminApi('/admin/faturas/fechar-mes', { method: 'POST', body: {} }); load(); }} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Fechar mês (gerar faturas)</button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.tenantNome}</td>
                <td className="px-4 py-3 text-muted">{r.competencia}</td>
                <td className="px-4 py-3 text-muted">{r.plano}</td>
                <td className="tabular px-4 py-3">{brl(Number(r.valorTotal))}</td>
                <td className="px-4 py-3">
                  <button onClick={async () => { await adminApi(`/admin/faturas/${r.id}/pagar`, { method: 'PATCH', body: { paga: r.status !== 'paga' } }); load(); }} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'paga' ? 'bg-success-tint text-[#0F6E56]' : 'bg-warning-tint text-[#854F0B]'}`}>{r.status === 'paga' ? <><Check size={12} /> Paga</> : 'Em aberto'}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma fatura. Use "Fechar mês".</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanosTab() {
  const [planos, setPlanos] = useState<any[]>([]);
  useEffect(() => { adminApi<any[]>('/admin/planos').then(setPlanos).catch(() => {}); }, []);
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">Planos</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {planos.map((p) => (
          <div key={p.tier} className="rounded-lg border border-line bg-surface p-4">
            <div className="text-sm font-semibold text-ink">{p.nome}</div>
            <div className="my-1 text-2xl font-semibold text-primary">{p.preco === 0 ? 'sob consulta' : brl(p.preco)}<span className="text-xs text-muted">{p.preco > 0 ? '/mês' : ''}</span></div>
            <div className="text-xs text-muted">Até {p.maxClientes < 0 ? '∞' : p.maxClientes} clientes · {p.disparosInclusos} disparos · {p.maxUsuarios < 0 ? '∞' : p.maxUsuarios} usuários</div>
            <div className="mt-2 flex flex-wrap gap-1">{p.features.map((f: string) => <span key={f} className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">{f}</span>)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Os valores/limites dos planos vêm de <code>src/modules/platform/plans.ts</code>. Para torná-los editáveis pelo painel, criamos uma tabela de planos — me avise que eu implemento.</p>
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
