'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Plug, LogOut, CreditCard, GitBranch, UserCog, Send, BarChart3, Gauge, HelpCircle, ChevronDown, Megaphone, Wallet, SlidersHorizontal, Radio, Menu, X, Mail, MessageSquare, PanelLeftClose, PanelLeftOpen, Eraser, Moon, Sun } from 'lucide-react';
import { Logo, LogoMark } from '@/components/Logo';
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
    { href: '/templates', label: 'Templates WhatsApp', icon: MessageSquare },
    { href: '/modelos-email', label: 'Modelos de e-mail', icon: Mail },
    { href: '/canais', label: 'Canais', icon: Radio },
  ] },
  { label: 'Análises', icon: BarChart3, items: [
    { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  ] },
  { label: 'Configurações', icon: SlidersHorizontal, items: [
    { href: '/integracoes', label: 'Integrações', icon: Plug },
    { href: '/equipe', label: 'Equipe', icon: UserCog },
    { href: '/plano', label: 'Plano', icon: Gauge },
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
  const [menuMinimizado, setMenuMinimizado] = useState(false);
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else {
      setMenuMinimizado(localStorage.getItem('recorra_sidebar_minimizada') === '1');
      // O tema já foi aplicado pelo script inline do layout raiz; aqui só espelhamos
      // o estado atual para o ícone/rótulo do botão ficarem certos.
      setEscuro(document.documentElement.classList.contains('dark'));
      setReady(true);
    }
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

  function alternarMenu() {
    setMenuMinimizado((atual) => {
      const proximo = !atual;
      localStorage.setItem('recorra_sidebar_minimizada', proximo ? '1' : '0');
      return proximo;
    });
  }

  function alternarTema() {
    setEscuro((atual) => {
      const proximo = !atual;
      document.documentElement.classList.toggle('dark', proximo);
      localStorage.setItem('recorra_tema', proximo ? 'dark' : 'light');
      return proximo;
    });
  }

  async function limparCache() {
    if (!window.confirm('Limpar o cache e as preferências locais do Recorrai? Sua sessão será mantida.')) return;
    const token = localStorage.getItem('recorra_token');
    const refresh = localStorage.getItem('recorra_refresh');
    localStorage.clear();
    sessionStorage.clear();
    if (token) localStorage.setItem('recorra_token', token);
    if (refresh) localStorage.setItem('recorra_refresh', refresh);
    if ('caches' in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    }
    window.location.reload();
  }

  const navContent = (compacto = false) => (
    <>
      <nav className={`min-h-0 flex-1 space-y-1 overflow-y-auto ${compacto ? 'p-2' : 'p-3'}`}>
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
              <Link key={it.href} href={it.href} title={compacto ? it.label : undefined} className={`flex items-center rounded py-2 text-sm transition ${compacto ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>
                <Icon size={18} />
                {!compacto && it.label}
              </Link>
            );
          }
          return (
            <div key={g.label} className="pt-1">
              <button onClick={() => toggle(g.label)} title={compacto ? g.label : undefined} className={`flex w-full items-center rounded py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-2 px-3'}`}>
                <GIcon size={15} />
                {!compacto && <><span className="flex-1 text-left">{g.label}</span><ChevronDown size={14} className={`transition ${aberto ? '' : '-rotate-90'}`} /></>}
              </button>
              {aberto && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map((it) => {
                    const Icon = it.icon;
                    const active = pathname.startsWith(it.href);
                    return (
                      <Link key={it.href} href={it.href} title={compacto ? it.label : undefined} className={`flex items-center rounded py-2 text-sm transition ${compacto ? 'justify-center px-2' : 'gap-3 pl-8 pr-3'} ${active ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>
                        <Icon size={16} />
                        {!compacto && it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className={`shrink-0 border-t border-line bg-surface ${compacto ? 'p-2' : 'p-3'}`}>
        <button onClick={alternarTema} title={compacto ? (escuro ? 'Modo claro' : 'Modo escuro') : undefined} aria-label={escuro ? 'Ativar modo claro' : 'Ativar modo escuro'} className={`mb-1 flex w-full items-center rounded py-2 text-sm text-muted transition hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}>{escuro ? <Sun size={18} /> : <Moon size={18} />}{!compacto && (escuro ? 'Modo claro' : 'Modo escuro')}</button>
        <button onClick={limparCache} title={compacto ? 'Limpar cache' : undefined} className={`mb-1 flex w-full items-center rounded py-2 text-sm text-muted transition hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}><Eraser size={18} />{!compacto && 'Limpar cache'}</button>
        <button onClick={sair} title={compacto ? 'Sair' : undefined} className={`flex w-full items-center rounded py-2 text-sm text-muted transition hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}><LogOut size={18} />{!compacto && 'Sair'}</button>
      </div>
    </>
  );

  return (
    // Shell de altura fixa: a página não rola inteira — só o <main> rola. Assim a
    // sidebar (e o topo no mobile) ficam sempre visíveis ao descer a lista.
    // No print, solta a trava para o conteúdo inteiro sair no PDF.
    <div className="flex h-screen overflow-hidden bg-canvas print:h-auto print:overflow-visible">
      {/* Sidebar fixa (desktop) */}
      <aside className={`hidden h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-200 md:flex print:hidden ${menuMinimizado ? 'w-16' : 'w-60'}`}>
        <div className={`flex items-center border-b border-line ${menuMinimizado ? 'flex-col justify-center gap-2 px-2 py-3' : 'justify-between px-5 py-4'}`}>
          {menuMinimizado ? <LogoMark size={28} /> : <Logo size={30} />}
          {!menuMinimizado && <button onClick={alternarMenu} title="Minimizar menu" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-primary"><PanelLeftClose size={18} /></button>}
          {menuMinimizado && <button onClick={alternarMenu} title="Expandir menu" aria-label="Expandir menu lateral" className="flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-canvas hover:text-primary"><PanelLeftOpen size={18} /></button>}
        </div>
        {navContent(menuMinimizado)}
      </aside>

      {/* Drawer + overlay (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuAberto(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-200 md:hidden print:hidden ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <Logo size={28} />
          <button onClick={() => setMenuAberto(false)} className="rounded p-1.5 text-muted hover:bg-canvas" aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>
        {navContent(false)}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden print:hidden">
          <button onClick={() => setMenuAberto(true)} className="rounded p-1.5 text-ink hover:bg-canvas" aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <Logo size={24} />
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
