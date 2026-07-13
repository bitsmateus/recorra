'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface User {
  id: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  convidado: boolean;
  emailVerify: boolean;
  twoFaEnabled: boolean;
}

const roles = ['OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR', 'LEITURA'];

export default function EquipePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [f, setF] = useState({ nome: '', email: '', role: 'OPERADOR' });
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<User[]>('/usuarios').then(setUsers).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function convidar() {
    setMsg('Enviando convite...');
    try {
      await api('/usuarios/convidar', { method: 'POST', body: f });
      setMsg('✓ Convite enviado');
      setF({ nome: '', email: '', role: 'OPERADOR' });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }
  async function mudarPapel(id: string, role: string) {
    await api(`/usuarios/${id}/papel`, { method: 'PATCH', body: { role } });
    load();
  }
  async function toggleAtivo(u: User) {
    await api(`/usuarios/${u.id}/ativo`, { method: 'PATCH', body: { ativo: !u.ativo } });
    load();
  }

  return (
    <div>
      <PageTitle title="Equipe" subtitle="Usuários do seu tenant, papéis e convites" />

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink"><UserPlus size={16} /> Convidar usuário</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary">
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={convidar} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Enviar convite</button>
        </div>
        {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                  {u.convidado ? (
                    <span className="text-warning">Convite pendente</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
