'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Plug, LogOut, CreditCard, Settings, GitBranch, UserCog, Send, BarChart3, Gauge, HelpCircle, ChevronDown, Megaphone, Wallet, SlidersHorizontal, Radio, Menu, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { getToken, logout } from '@/lib/api';

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };
type Grupo = { label: string; icon: React.ComponentType<{ size?: number }>; items: Item[] };

const grupos: Grupo[] = [
  { label: 'Início', icon: LayoutDashboard, items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { label: 'Cobrança', icon: Wallet, items: [
    { href: '/clientes', label: 'Clientes', icon: Users },
    { href: '/cobrancas', label: 'Cobranças', icon: CreditCard },
  ] },
  { label: 'Comunicação', icon: Megaphone, items: [
    { href: '/campanhas', label: 'Campanhas', icon: Megaphone },
    { href: '/disparos', label: 'Disparos', icon: Send },
    { href: '/reguas', label: 'Réguas', icon: GitBranch },
    { href: '/canais', label: 'Canais', icon: Radio },
  ] },
  { label: 'Análises', icon: BarChart3, items: [
    { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  ] },
  { label: 'Configurações', icon: SlidersHorizontal, items: [
    { href: '/integracoes', label: 'Integrações', icon: Plug },
    { href: '/equipe', label: 'Equipe', icon: UserCog },
    { href: '/plano', label: 'Plano', icon: Gauge },
    { href: '/configuracoes', label: 'Ajustes', icon: Settings },
  ] },
  { label: 'Ajuda', icon: HelpCircle, items: [
    { href: '/ajuda', label: 'Central de Ajuda', icon: HelpCircle },
  ] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // Grupos começam fechados; abrimos automaticamente apenas o da rota atual.
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  // Fecha o menu mobile ao navegar e abre o grupo da rota ativa.
  useEffect(() => {
    setMenuAberto(false);
    const ativo = grupos.find((g) => g.items.some((it) => pathname.startsWith(it.href)));
    if (ativo) setAbertos((s) => ({ ...s, [ativo.label]: true }));
  }, [pathname]);

  // Trava o scroll do body quando o drawer mobile está aberto.
  useEffect(() => {
    document.body.style.overflow = menuAberto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuAberto]);

  if (!ready) return null;

  async function sair() {
    await logout(); // revoga o refresh no servidor, não só no navegador
    router.replace('/login');
  }

  function toggle(label: string) {
    setAbertos((s) => ({ ...s, [label]: !s[label] }));
  }

  const navContent = (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {grupos.map((g) => {
          const aberto = abertos[g.label];
          const GIcon = g.icon;
          const soloItem = g.items.length === 1;
          // Grupos com um único item viram link direto (sem cabeçalho recolhível).
          if (soloItem) {
            const it = g.items[0];
            const Icon = it.icon;
            const active = pathname.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition ${active ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>
                <Icon size={18} />
                {it.label}
              </Link>
            );
          }
          return (
            <div key={g.label} className="pt-1">
              <button onClick={() => toggle(g.label)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-canvas">
                <GIcon size={15} />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown size={14} className={`transition ${aberto ? '' : '-rotate-90'}`} />
              </button>
              {aberto && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map((it) => {
                    const Icon = it.icon;
                    const active = pathname.startsWith(it.href);
                    return (
                      <Link key={it.href} href={it.href} className={`flex items-center gap-3 rounded py-2 pl-8 pr-3 text-sm transition ${active ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>
                        <Icon size={16} />
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <button onClick={sair} className="m-3 flex items-center gap-3 rounded px-3 py-2 text-sm text-muted transition hover:bg-canvas">
        <LogOut size={18} />
        Sair
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar fixa (desktop) */}
      <aside className="hidden w-60 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-5 py-4">
          <Logo size={30} />
        </div>
        {navContent}
      </aside>

      {/* Drawer + overlay (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuAberto(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-200 md:hidden ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <Logo size={28} />
          <button onClick={() => setMenuAberto(false)} className="rounded p-1.5 text-muted hover:bg-canvas" aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>
        {navContent}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <button onClick={() => setMenuAberto(true)} className="rounded p-1.5 text-ink hover:bg-canvas" aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <Logo size={24} />
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
