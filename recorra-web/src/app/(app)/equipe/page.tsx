'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, ShieldCheck, KeyRound, X, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface User {
  id: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  semSenha: boolean;
  emailVerify: boolean;
  twoFaEnabled: boolean;
}

const roles = ['OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR', 'LEITURA'];
const SENHA_MIN = 8;
const inputCls = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary';

/** Senha forte o bastante para o mínimo do backend, sem caractere ambíguo. */
function gerarSenha(): string {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return [...b].map((n) => abc[n % abc.length]).join('');
}

export default function EquipePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [f, setF] = useState({ nome: '', email: '', senha: '', role: 'OPERADOR' });
  const [verSenha, setVerSenha] = useState(false);
  const [senhaDe, setSenhaDe] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<User[]>('/usuarios').then(setUsers).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function criar() {
    if (!f.nome.trim()) return setMsg('Informe o nome.');
    if (!f.email.trim()) return setMsg('Informe o e-mail.');
    if (f.senha.length < SENHA_MIN) return setMsg(`A senha precisa ter no mínimo ${SENHA_MIN} caracteres.`);
    setBusy(true); setMsg('');
    try {
      await api('/usuarios', { method: 'POST', body: f });
      setMsg(`✓ Usuário criado. Passe o e-mail e a senha para ${f.nome.split(' ')[0]} — ele já consegue entrar.`);
      setF({ nome: '', email: '', senha: '', role: 'OPERADOR' });
      setVerSenha(false);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }
  async function mudarPapel(id: string, role: string) {
    await api(`/usuarios/${id}/papel`, { method: 'PATCH', body: { role } }).catch((e) => setMsg(e.message));
    load();
  }
  async function toggleAtivo(u: User) {
    await api(`/usuarios/${u.id}/ativo`, { method: 'PATCH', body: { ativo: !u.ativo } }).catch((e) => setMsg(e.message));
    load();
  }

  return (
    <div>
      <PageTitle title="Equipe" subtitle="Usuários do seu tenant, papéis e acessos" />

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-ink"><UserPlus size={16} /> Criar usuário</h2>
        <p className="mb-3 text-xs text-muted">Você define o e-mail e a senha; a pessoa já entra com eles. Não enviamos e-mail — passe as credenciais por um canal seguro.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={inputCls} />
          <input placeholder="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
          <div className="relative">
            <input
              placeholder={`Senha (mín. ${SENHA_MIN})`}
              type={verSenha ? 'text' : 'password'}
              value={f.senha}
              onChange={(e) => setF({ ...f, senha: e.target.value })}
              className={`${inputCls} pr-9`}
            />
            <button type="button" onClick={() => setVerSenha((v) => !v)} title={verSenha ? 'Ocultar' : 'Mostrar'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              {verSenha ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inputCls}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={criar} disabled={busy} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
            {busy ? 'Criando...' : 'Criar usuário'}
          </button>
        </div>
        <button type="button" onClick={() => { setF((s) => ({ ...s, senha: gerarSenha() })); setVerSenha(true); }} className="mt-2 text-xs font-medium text-primary hover:underline">
          Gerar senha segura
        </button>
        {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{u.nome}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select value={u.role} onChange={(e) => mudarPapel(u.id, e.target.value)} disabled={u.role === 'OWNER'} className="rounded border border-line px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-60">
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs">
                  {u.semSenha ? (
                    <span className="text-warning">Sem senha — não consegue entrar</span>
                  ) : (
                    <span className="flex items-center gap-2 text-muted">
                      {u.emailVerify ? '✓ E-mail verificado' : 'E-mail não verificado'}
                      {u.twoFaEnabled && <span className="flex items-center gap-1 text-primary"><ShieldCheck size={13} /> 2FA</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleAtivo(u)} disabled={u.role === 'OWNER'} className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${u.ativo ? 'bg-success-tint text-[#0F6E56]' : 'bg-danger-tint text-[#A32D2D]'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSenhaDe(u)} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs ${u.semSenha ? 'border-primary/40 bg-primary-tint font-medium text-primary' : 'border-line text-muted hover:bg-canvas hover:text-primary'}`}>
                    <KeyRound size={13} /> {u.semSenha ? 'Definir senha' : 'Trocar senha'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {senhaDe && <SenhaModal user={senhaDe} onClose={() => setSenhaDe(null)} onSaved={(m) => { setSenhaDe(null); setMsg(m); load(); }} />}
    </div>
  );
}

function SenhaModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (msg: string) => void }) {
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function salvar() {
    if (senha.length < SENHA_MIN) return setMsg(`A senha precisa ter no mínimo ${SENHA_MIN} caracteres.`);
    setBusy(true); setMsg('');
    try {
      await api(`/usuarios/${user.id}/senha`, { method: 'PATCH', body: { senha } });
      onSaved(`✓ Senha definida para ${user.nome}. Passe a nova senha para ele.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{user.semSenha ? 'Definir senha' : 'Trocar senha'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted">{user.nome} · {user.email}</p>

        <label className="mb-2 block text-sm"><span className="mb-1 block text-xs text-muted">Nova senha (mín. {SENHA_MIN})</span>
          <div className="relative">
            <input type={ver ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} className={`${inputCls} pr-9`} />
            <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              {ver ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        <button type="button" onClick={() => { setSenha(gerarSenha()); setVer(true); }} className="mb-4 text-xs font-medium text-primary hover:underline">Gerar senha segura</button>

        {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-line px-4 py-2 text-sm hover:bg-canvas">Cancelar</button>
          <button onClick={salvar} disabled={busy} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{busy ? 'Salvando...' : 'Salvar senha'}</button>
        </div>
        <p className="mt-3 text-xs text-muted">A pessoa entra com o e-mail acima e esta senha. Passe por um canal seguro.</p>
      </div>
    </div>
  );
}
