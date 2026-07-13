'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
  }, []);

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) return setErro('A senha deve ter ao menos 6 caracteres.');
    if (senha !== confirma) return setErro('As senhas não coincidem.');
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, senha }, auth: false });
      setOk(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao redefinir');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex justify-center"><Logo size={40} /></div>
        {ok ? (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-ink">Senha redefinida!</h1>
            <p className="mb-6 text-center text-sm text-muted">Você já pode entrar com a nova senha. Redirecionando...</p>
            <Link href="/login" className="block w-full rounded bg-primary py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover">Ir para o login</Link>
          </>
        ) : !token ? (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-ink">Link inválido</h1>
            <p className="mb-6 text-center text-sm text-muted">Este link de redefinição não é válido. Solicite um novo.</p>
            <Link href="/esqueci-senha" className="block w-full rounded bg-primary py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover">Solicitar novo link</Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-ink">Criar nova senha</h1>
            <p className="mb-6 text-center text-sm text-muted">Defina a nova senha da sua conta.</p>
            <form onSubmit={redefinir} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">Nova senha</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Confirmar senha</label>
                <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              {erro && <p className="text-sm text-danger">{erro}</p>}
              <button type="submit" disabled={loading} className="w-full rounded bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60">{loading ? 'Salvando...' : 'Redefinir senha'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
