'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Scope { scope: string; label: string }
interface Token {
  id: string; nome: string; prefixo: string; tipo: string; scopes: string[];
  ativo: boolean; expiraEm?: string | null; ultimoUso?: string | null; createdAt: string;
}

/** Base pública da API (inclui /api). Ex.: https://appapi.recorrai.com.br/api */
const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

// Referência dos endpoints da API pública — casada com o backend (/api/v1/*).
const REFERENCIA: { grupo: string; escopoBase: string; rotas: { m: string; path: string; scope: string; desc: string }[] }[] = [
  { grupo: 'Clientes', escopoBase: 'clientes', rotas: [
    { m: 'GET', path: '/v1/clientes', scope: 'clientes:read', desc: 'Lista clientes (page, pageSize, q)' },
    { m: 'GET', path: '/v1/clientes/:id', scope: 'clientes:read', desc: 'Detalhe de um cliente' },
    { m: 'POST', path: '/v1/clientes', scope: 'clientes:write', desc: 'Cria cliente ({ nome, doc, email?, telefone? })' },
    { m: 'PUT', path: '/v1/clientes/:id', scope: 'clientes:write', desc: 'Atualiza cliente' },
    { m: 'DELETE', path: '/v1/clientes/:id', scope: 'clientes:write', desc: 'Exclui cliente' },
  ] },
  { grupo: 'Cobranças', escopoBase: 'cobrancas', rotas: [
    { m: 'GET', path: '/v1/cobrancas', scope: 'cobrancas:read', desc: 'Lista cobranças (page, pageSize, status)' },
    { m: 'GET', path: '/v1/cobrancas/:id', scope: 'cobrancas:read', desc: 'Detalhe de uma cobrança' },
    { m: 'POST', path: '/v1/cobrancas', scope: 'cobrancas:write', desc: 'Cria fatura ({ customerId, valor, vencimento })' },
    { m: 'POST', path: '/v1/cobrancas/:id/gerar', scope: 'cobrancas:write', desc: 'Gera Pix/boleto ({ accountId, metodo? })' },
  ] },
  { grupo: 'Usuários', escopoBase: 'usuarios', rotas: [
    { m: 'GET', path: '/v1/usuarios', scope: 'usuarios:read', desc: 'Lista usuários do tenant' },
    { m: 'POST', path: '/v1/usuarios', scope: 'usuarios:write', desc: 'Cria usuário ({ nome, email, senha, role? })' },
  ] },
  { grupo: 'Tenants (plataforma)', escopoBase: 'tenants', rotas: [
    { m: 'GET', path: '/v1/tenants', scope: 'tenants:read', desc: 'Lista tenants — requer token de plataforma' },
    { m: 'POST', path: '/v1/tenants', scope: 'tenants:write', desc: 'Cria tenant ({ empresa, nome, email, senha }) — token de plataforma' },
  ] },
];

const metodoCor: Record<string, string> = { GET: 'bg-success-tint text-[#0F6E56]', POST: 'bg-primary-tint text-primary', PUT: 'bg-warning-tint text-[#854F0B]', DELETE: 'bg-danger-tint text-[#A32D2D]' };
const dataHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function ApiTokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [nome, setNome] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [expiraEm, setExpiraEm] = useState('');
  const [novo, setNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [refAberta, setRefAberta] = useState(true);

  const carregar = useCallback(async () => {
    const [ks, sc] = await Promise.all([
      api<Token[]>('/config/api-keys').catch(() => []),
      api<Scope[]>('/config/api-keys/scopes').catch(() => []),
    ]);
    setTokens(ks); setScopes(sc);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const toggleScope = (s: string) => setSel((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  async function criar() {
    if (!nome.trim()) return setMsg('Dê um nome ao token.');
    if (sel.size === 0) return setMsg('Selecione ao menos uma permissão.');
    setBusy(true); setMsg('');
    try {
      const r = await api<{ apiKey: string }>('/config/api-keys', { method: 'POST', body: { nome: nome.trim(), scopes: [...sel], expiraEm: expiraEm || null } });
      setNovo(r.apiKey); setCopiado(false);
      setNome(''); setSel(new Set()); setExpiraEm('');
      carregar();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro ao criar token'); }
    setBusy(false);
  }

  async function revogar(id: string) {
    if (!window.confirm('Revogar este token? Integrações que o usam vão parar de funcionar imediatamente.')) return;
    await api(`/config/api-keys/${id}`, { method: 'DELETE' }).catch(() => {});
    carregar();
  }

  function copiar() {
    if (!novo) return;
    navigator.clipboard?.writeText(novo).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => {});
  }

  return (
    <div className="pb-10">
      <PageTitle title="API" subtitle="Tokens de acesso e referência dos endpoints para integrar sistemas externos." />

      {/* Token recém-criado — mostrado UMA vez */}
      {novo && (
        <div className="mb-4 rounded-lg border border-primary/40 bg-primary-tint/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Token criado — copie agora</h2>
            <button onClick={() => setNovo(null)} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink"><X size={16} /></button>
          </div>
          <p className="mb-2 text-xs text-muted">Por segurança, ele <b>não será exibido de novo</b>. Guarde num lugar seguro.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-line bg-surface px-3 py-2 text-sm text-ink">{novo}</code>
            <button onClick={copiar} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover">{copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar'}</button>
          </div>
        </div>
      )}

      {/* Criar token */}
      <div className="mb-5 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Plus size={16} className="text-primary" /> Criar token</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block md:col-span-2"><span className="mb-1 block text-xs text-muted">Nome (para você identificar)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Integração ERP, App interno..." className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block"><span className="mb-1 block text-xs text-muted">Expira em (opcional)</span>
            <input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
        </div>
        <div className="mt-3">
          <span className="mb-1.5 block text-xs text-muted">Permissões (o que este token poderá fazer)</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {scopes.map((s) => (
              <label key={s.scope} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${sel.has(s.scope) ? 'border-primary bg-primary-tint/50 text-ink' : 'border-line hover:bg-canvas'}`}>
                <input type="checkbox" checked={sel.has(s.scope)} onChange={() => toggleScope(s.scope)} className="h-4 w-4 accent-primary" />
                <span className="flex-1">{s.label}</span>
                <code className="text-[11px] text-muted">{s.scope}</code>
              </label>
            ))}
            {scopes.length === 0 && <span className="text-xs text-muted">Carregando permissões…</span>}
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
        <div className="mt-3">
          <button onClick={criar} disabled={busy} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><KeyRound size={15} /> {busy ? 'Criando…' : 'Criar token'}</button>
        </div>
      </div>

      {/* Lista de tokens */}
      <div className="mb-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Tokens ativos</div>
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-2.5 font-medium">Nome</th><th className="px-4 py-2.5 font-medium">Prefixo</th><th className="px-4 py-2.5 font-medium">Permissões</th><th className="px-4 py-2.5 font-medium">Último uso</th><th className="px-4 py-2.5 font-medium">Expira</th><th className="px-4 py-2.5 font-medium text-right">Ações</th></tr>
          </thead>
          <tbody>
            {tokens.filter((t) => t.ativo).map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{t.nome}</td>
                <td className="px-4 py-3"><code className="text-xs text-muted">{t.prefixo}…</code></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{t.scopes.map((s) => <code key={s} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{s}</code>)}</div></td>
                <td className="px-4 py-3 text-muted">{dataHora(t.ultimoUso)}</td>
                <td className="px-4 py-3 text-muted">{t.expiraEm ? dataHora(t.expiraEm) : '—'}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => revogar(t.id)} title="Revogar" className="rounded p-1.5 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {tokens.filter((t) => t.ativo).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum token ativo. Crie um acima.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* Referência da API */}
      <div className="rounded-lg border border-line bg-surface">
        <button onClick={() => setRefAberta((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-canvas">
          {refAberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Referência da API
        </button>
        {refAberta && (
          <div className="border-t border-line p-4">
            <div className="mb-4 space-y-1 text-sm text-muted">
              <p>Base: <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">{apiBase}</code></p>
              <p>Autenticação: envie o header <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">x-api-key: SEU_TOKEN</code> em toda requisição.</p>
            </div>
            <pre className="mb-4 overflow-x-auto rounded-lg border border-line bg-canvas p-3 text-xs text-ink">{`curl -s "${apiBase}/v1/clientes?page=1" \\
  -H "x-api-key: rec_xxxxxxxxxxxx"`}</pre>
            {REFERENCIA.map((g) => (
              <div key={g.grupo} className="mb-4 last:mb-0">
                <h3 className="mb-1.5 text-sm font-semibold text-ink">{g.grupo}</h3>
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <tbody>
                      {g.rotas.map((r) => (
                        <tr key={r.m + r.path} className="border-b border-line last:border-0">
                          <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${metodoCor[r.m]}`}>{r.m}</span></td>
                          <td className="px-3 py-2"><code className="text-xs text-ink">{r.path}</code></td>
                          <td className="px-3 py-2"><code className="text-[11px] text-muted">{r.scope}</code></td>
                          <td className="px-3 py-2 text-xs text-muted">{r.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">Os tokens de <b>plataforma</b> (que criam tenants) são gerados pelo superadmin — não por aqui. Esta tela cria tokens do seu tenant.</p>
          </div>
        )}
      </div>
    </div>
  );
}
