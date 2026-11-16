'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, UserRound, Save } from 'lucide-react';
import { api, logout } from '@/lib/api';
import { PageTitle } from '@/components/ui';

interface Perfil {
  id: string; nome: string; email: string; role: string; emailVerify: boolean; twoFaEnabled: boolean; createdAt: string; provider: string;
  carteira: { nome: string; diaMinimo: number } | null; nxUserId: number | null; nxQueueId: number | null;
  empresa: string; clientesResponsavel: number; clientesVencidos: number;
}

const PAPEL: Record<string, string> = {
  OWNER: 'Dono da conta', ADMIN: 'Administrador', FINANCEIRO: 'Financeiro', OPERADOR: 'Operador de cobrança', LEITURA: 'Somente leitura',
};
const inputCls = 'w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary';

/** Meu perfil: ver os próprios dados, trocar nome e senha e ligar a verificação em duas etapas. */
export default function PerfilPage() {
  const router = useRouter();
  const [p, setP] = useState<Perfil | null>(null);
  const [nome, setNome] = useState('');
  const [msgNome, setMsgNome] = useState('');
  const [senha, setSenha] = useState({ atual: '', nova: '', confirma: '' });
  const [msgSenha, setMsgSenha] = useState('');
  const [doisFa, setDoisFa] = useState<{ qr: string | null; secret: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [msg2fa, setMsg2fa] = useState('');
  const [busy, setBusy] = useState(false);

  const carregar = () => api<Perfil>('/usuarios/me').then((r) => { setP(r); setNome(r.nome); }).catch(() => {});
  useEffect(() => { carregar(); }, []);

  async function salvarNome() {
    setBusy(true); setMsgNome('');
    try { const r = await api<Perfil>('/usuarios/me', { method: 'PATCH', body: { nome } }); setP(r); setMsgNome('✓ Nome atualizado.'); }
    catch (e) { setMsgNome(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }

  async function trocarSenha() {
    setMsgSenha('');
    if (senha.nova.length < 8) return setMsgSenha('A nova senha precisa ter pelo menos 8 caracteres.');
    if (senha.nova !== senha.confirma) return setMsgSenha('A confirmação não bate com a nova senha.');
    setBusy(true);
    try {
      await api('/usuarios/me/senha', { method: 'POST', body: { senhaAtual: senha.atual, novaSenha: senha.nova } });
      window.alert('Senha alterada. Entre de novo com a senha nova.');
      await logout();
      router.replace('/login');
    } catch (e) { setMsgSenha(e instanceof Error ? e.message : 'Erro'); setBusy(false); }
  }

  async function iniciar2fa() {
    setMsg2fa(''); setBusy(true);
    try { setDoisFa(await api<{ qr: string | null; secret: string }>('/auth/2fa/setup', { method: 'POST' })); }
    catch (e) { setMsg2fa(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }
  async function confirmar2fa(acao: 'enable' | 'disable') {
    setMsg2fa(''); setBusy(true);
    try {
      await api(`/auth/2fa/${acao}`, { method: 'POST', body: { codigo } });
      setDoisFa(null); setCodigo('');
      setMsg2fa(acao === 'enable' ? '✓ Verificação em duas etapas ligada.' : 'Verificação em duas etapas desligada.');
      carregar();
    } catch (e) { setMsg2fa(e instanceof Error ? e.message : 'Código inválido'); }
    finally { setBusy(false); }
  }

  if (!p) return <div className="text-sm text-muted">Carregando…</div>;

  return (
    <div className="max-w-3xl">
      <PageTitle title="Meu perfil" subtitle={`${p.empresa} · ${PAPEL[p.role] ?? p.role}`} />

      <div className="mb-4 rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><UserRound size={16} /> Meus dados</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Nome</span>
            <div className="flex gap-2">
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
              <button onClick={salvarNome} disabled={busy || nome.trim() === p.nome} className="flex items-center gap-1 rounded bg-primary px-3 text-sm font-medium text-white disabled:opacity-50"><Save size={14} /> Salvar</button>
            </div>
            {msgNome && <span className="mt-1 block text-xs text-primary">{msgNome}</span>}
          </label>
          <div className="text-sm"><span className="mb-1 block text-xs text-muted">E-mail de acesso</span>
            <div className="rounded border border-line bg-canvas px-3 py-2 text-ink">{p.email}</div>
            <span className="mt-1 block text-xs text-muted">{p.emailVerify ? '✓ verificado' : 'não verificado'} · para trocar o e-mail, peça a um administrador.</span>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Papel</dt><dd className="text-ink">{PAPEL[p.role] ?? p.role}</dd></div>
          <div><dt className="text-xs text-muted">Carteira</dt><dd className="text-ink">{p.carteira ? `${p.carteira.nome} (a partir de D+${p.carteira.diaMinimo})` : 'Sem carteira (vê a esteira toda)'}</dd></div>
          <div><dt className="text-xs text-muted">Clientes sob minha responsabilidade</dt><dd className="text-ink"><b>{p.clientesResponsavel}</b> · {p.clientesVencidos} com fatura vencida</dd></div>
          <div><dt className="text-xs text-muted">Vínculo com o NX</dt><dd className="text-ink">{p.nxUserId ? `usuário ${p.nxUserId}${p.nxQueueId ? ` · fila ${p.nxQueueId}` : ''}` : 'não vinculado'}</dd></div>
          <div><dt className="text-xs text-muted">Acesso criado em</dt><dd className="text-ink">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</dd></div>
        </dl>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><KeyRound size={16} /> Trocar senha</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Senha atual</span><input type="password" autoComplete="current-password" value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} className={inputCls} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Nova senha (mín. 8)</span><input type="password" autoComplete="new-password" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} className={inputCls} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted">Confirmar nova senha</span><input type="password" autoComplete="new-password" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} className={inputCls} /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={trocarSenha} disabled={busy || !senha.nova} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Trocar senha</button>
          <span className="text-xs text-muted">Ao trocar, você sai de todos os aparelhos e entra de novo com a senha nova.</span>
        </div>
        {msgSenha && <p className="mt-2 text-sm text-danger">{msgSenha}</p>}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck size={16} /> Verificação em duas etapas</div>
        <p className="mb-3 text-sm text-muted">
          {p.twoFaEnabled ? 'Ligada: além da senha, o login pede o código do app autenticador.' : 'Desligada. Com ela, o login também pede um código do seu celular (Google Authenticator, Microsoft Authenticator…).'}
        </p>
        {!p.twoFaEnabled && !doisFa && <button onClick={iniciar2fa} disabled={busy} className="rounded border border-primary/40 bg-primary-tint px-4 py-2 text-sm font-medium text-primary">Ligar verificação em duas etapas</button>}
        {!p.twoFaEnabled && doisFa && (
          <div className="flex flex-wrap items-start gap-4">
            {doisFa.qr && <img src={doisFa.qr} alt="QR code para o app autenticador" className="h-40 w-40 rounded border border-line" />}
            <div className="min-w-[220px] flex-1 text-sm">
              <p className="mb-2 text-muted">1. Leia o QR code no app autenticador (ou digite a chave <code className="rounded bg-canvas px-1 text-xs">{doisFa.secret}</code>).<br />2. Digite o código de 6 dígitos que aparece:</p>
              <div className="flex gap-2">
                <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="Código do app autenticador" className="w-32 rounded border border-line px-3 py-2 text-center font-mono tracking-widest outline-none focus:border-primary" />
                <button onClick={() => confirmar2fa('enable')} disabled={busy || codigo.length !== 6} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmar</button>
              </div>
            </div>
          </div>
        )}
        {p.twoFaEnabled && (
          <div className="flex flex-wrap items-center gap-2">
            <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="código atual" aria-label="Código atual do app autenticador" className="w-36 rounded border border-line px-3 py-2 text-center font-mono outline-none focus:border-primary" />
            <button onClick={() => confirmar2fa('disable')} disabled={busy || codigo.length !== 6} className="rounded border border-line px-4 py-2 text-sm text-danger hover:bg-danger-tint disabled:opacity-50">Desligar</button>
          </div>
        )}
        {msg2fa && <p className="mt-2 text-sm text-primary">{msg2fa}</p>}
      </div>
    </div>
  );
}
