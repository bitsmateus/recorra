'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Plug, LogOut, CreditCard, Settings, GitBranch, UserCog, Send, BarChart3, Gauge, HelpCircle, ChevronDown, Megaphone, Wallet, SlidersHorizontal, Radio } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { getToken, clearToken } from '@/lib/api';

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
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => Object.fromEntries(grupos.map((g) => [g.label, true])));

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  function sair() {
    clearToken();
    router.replace('/login');
  }

  function toggle(label: string) {
    setAbertos((s) => ({ ...s, [label]: !s[label] }));
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-60 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Logo size={30} />
        </div>
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
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
