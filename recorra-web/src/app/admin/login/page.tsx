'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, setAdminToken } from '@/lib/adminApi';
import { LogoMark } from '@/components/Logo';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('super@recorra.com.br');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const { accessToken } = await adminApi<{ accessToken: string }>('/admin/login', {
        method: 'POST',
        body: { email, senha },
        auth: false,
      });
      setAdminToken(accessToken);
      router.push('/admin');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <LogoMark size={40} />
          <span className="text-sm font-medium text-muted">Plataforma · Superadmin</span>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha" className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
          {erro && <p className="text-sm text-danger">{erro}</p>}
          <button disabled={loading} className="w-full rounded bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
