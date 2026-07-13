'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }).catch(() => {});
    setLoading(false);
    setEnviado(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex justify-center"><Logo size={40} /></div>
        {enviado ? (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-ink">Verifique seu e-mail</h1>
            <p className="mb-6 text-center text-sm text-muted">Se existir uma conta com <b>{email}</b>, enviamos um link para redefinir a senha. O link vale por 1 hora.</p>
            <Link href="/login" className="block w-full rounded bg-primary py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover">Voltar ao login</Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-ink">Esqueceu a senha?</h1>
            <p className="mb-6 text-center text-sm text-muted">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
            <form onSubmit={enviar} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <button type="submit" disabled={loading} className="w-full rounded bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60">{loading ? 'Enviando...' : 'Enviar link'}</button>
              <Link href="/login" className="block text-center text-xs text-muted hover:underline">Voltar ao login</Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
