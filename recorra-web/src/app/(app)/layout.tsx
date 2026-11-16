'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Plug, LogOut, CreditCard, GitBranch, UserCog, Send, BarChart3, Gauge, HelpCircle, ChevronDown, Megaphone, Wallet, SlidersHorizontal, Radio, Menu, X, Mail, MessageSquare, PanelLeftClose, PanelLeftOpen, Eraser, Moon, Sun, Columns3, KeyRound, CircleUserRound, Pin, PinOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { api, getToken, logout } from '@/lib/api';
import { APP_VERSION } from '@/lib/version';

type Item = { href: string; label: string; icon: LucideIcon; tela?: string };
type Grupo = { label: string; icon: LucideIcon; items: Item[] };

/** Cada item tem a sua "tela": só aparece para quem a tem liberada (Equipe → Telas;
 *  sem escolha, vale o padrão do papel — operador vê só o que é dele). A API confere de novo. */
const grupos: Grupo[] = [
  { label: 'Início', icon: LayoutDashboard, items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, tela: 'dashboard' },
  ] },
  { label: 'Cobrança', icon: Wallet, items: [
    { href: '/clientes', label: 'Clientes', icon: Users, tela: 'clientes' },
    { href: '/cobrancas', label: 'Cobranças', icon: CreditCard, tela: 'cobrancas' },
  ] },
  { label: 'Comunicação', icon: Megaphone, items: [
    { href: '/campanhas', label: 'Campanhas', icon: Megaphone, tela: 'campanhas' },
    { href: '/disparos', label: 'Disparos', icon: Send, tela: 'disparos' },
    { href: '/reguas', label: 'Réguas', icon: GitBranch, tela: 'reguas' },
    { href: '/andamento', label: 'Esteira', icon: Columns3, tela: 'esteira' },
  ] },
  { label: 'Análises', icon: BarChart3, items: [
    { href: '/relatorios', label: 'Relatórios', icon: BarChart3, tela: 'relatorios' },
  ] },
  { label: 'Configurações', icon: SlidersHorizontal, items: [
    { href: '/integracoes', label: 'Integrações', icon: Plug, tela: 'integracoes' },
    { href: '/canais', label: 'Canais', icon: Radio, tela: 'canais' },
    { href: '/templates', label: 'Templates WhatsApp', icon: MessageSquare, tela: 'templates' },
    { href: '/modelos-email', label: 'Modelos de e-mail', icon: Mail, tela: 'modelos-email' },
    { href: '/equipe', label: 'Equipe', icon: UserCog, tela: 'equipe' },
    { href: '/api-tokens', label: 'API', icon: KeyRound, tela: 'api' },
    { href: '/plano', label: 'Plano', icon: Gauge, tela: 'plano' },
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
  const [telas, setTelas] = useState<string[] | null>(null);
  // Itens fixados no topo do menu (preferência deste navegador).
  const [fixados, setFixados] = useState<string[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem('recorra_menu_fixados') ?? '[]'); if (Array.isArray(v)) setFixados(v.filter((x) => typeof x === 'string')); } catch { /* sem preferências */ }
  }, []);
  function alternarFixado(href: string) {
    setFixados((atual) => {
      const prox = atual.includes(href) ? atual.filter((h) => h !== href) : [...atual, href];
      try { localStorage.setItem('recorra_menu_fixados', JSON.stringify(prox)); } catch { /* ignora */ }
      return prox;
    });
  }

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else {
      setMenuMinimizado(localStorage.getItem('recorra_sidebar_escondida') === '1');
      // O tema já foi aplicado pelo script inline do layout raiz; aqui só espelhamos
      // o estado atual para o ícone/rótulo do botão ficarem certos.
      setEscuro(document.documentElement.classList.contains('dark'));
      setReady(true);
    }
  }, [router]);

  // Telas liberadas para quem está logado (lidas do servidor: mudar em Equipe vale no próximo carregamento).
  useEffect(() => {
    if (!ready) return;
    api<{ telas: string[] }>('/usuarios/me').then((m) => setTelas(m.telas)).catch(() => setTelas([]));
  }, [ready]);

  // Tela não liberada digitada direto na barra: leva para a primeira liberada.
  useEffect(() => {
    if (!telas) return;
    const todos = grupos.flatMap((g) => g.items);
    const item = todos.find((it) => pathname.startsWith(it.href));
    if (item?.tela && !telas.includes(item.tela)) {
      const destino = todos.find((it) => !it.tela || telas.includes(it.tela));
      router.replace(destino?.href ?? '/perfil');
    }
  }, [telas, pathname, router]);

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
      localStorage.setItem('recorra_sidebar_escondida', proximo ? '1' : '0');
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

  const visivel = (it: Item) => !it.tela || (telas !== null && telas.includes(it.tela));
  const todosItens = grupos.flatMap((g) => g.items).filter(visivel);
  const itensFixados = fixados.map((h) => todosItens.find((it) => it.href === h)).filter(Boolean) as Item[];

  /** Link do menu com o alfinete de fixar no topo (aparece ao passar o mouse). */
  const linkItem = (it: Item, compacto: boolean, recuo: boolean) => {
    const Icon = it.icon;
    const active = pathname.startsWith(it.href);
    const fixo = fixados.includes(it.href);
    return (
      <div key={it.href} className="group relative">
        <Link href={it.href} title={compacto ? it.label : undefined} className={`flex items-center rounded py-2 text-sm transition ${compacto ? 'justify-center px-2' : `gap-3 ${recuo ? 'pl-8' : 'px-3'} pr-8`} ${active ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'}`}>
          <Icon size={recuo ? 16 : 18} />
          {!compacto && it.label}
        </Link>
        {!compacto && (
          <button type="button" onClick={() => alternarFixado(it.href)} title={fixo ? 'Desafixar do topo' : 'Fixar no topo do menu'} aria-label={fixo ? `Desafixar ${it.label}` : `Fixar ${it.label} no topo`}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition ${fixo ? 'text-primary opacity-100' : 'text-muted opacity-0 hover:text-primary focus:opacity-100 group-hover:opacity-100'}`}>
            {fixo ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
        )}
      </div>
    );
  };

  const navContent = (compacto = false) => (
    <>
      <nav className={`min-h-0 flex-1 space-y-1 overflow-y-auto ${compacto ? 'p-2' : 'p-3'}`}>
        {itensFixados.length > 0 && (
          <div className="mb-2 border-b border-line pb-2">
            {!compacto && <div className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted"><Pin size={13} /> Fixados</div>}
            <div className="space-y-0.5">{itensFixados.map((it) => linkItem(it, compacto, false))}</div>
          </div>
        )}
        {grupos
          .map((g) => ({ ...g, items: g.items.filter(visivel) }))
          .filter((g) => g.items.length > 0)
          .map((g) => {
          const aberto = abertos[g.label];
          const GIcon = g.icon;
          // Grupos com um único item viram link direto (sem cabeçalho recolhível).
          if (g.items.length === 1) return linkItem(g.items[0], compacto, false);
          return (
            <div key={g.label} className="pt-1">
              <button onClick={() => toggle(g.label)} title={compacto ? g.label : undefined} className={`flex w-full items-center rounded py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-2 px-3'}`}>
                <GIcon size={15} />
                {!compacto && <><span className="flex-1 text-left">{g.label}</span><ChevronDown size={14} className={`transition ${aberto ? '' : '-rotate-90'}`} /></>}
              </button>
              {aberto && <div className="mt-0.5 space-y-0.5">{g.items.map((it) => linkItem(it, compacto, true))}</div>}
            </div>
          );
        })}
      </nav>
      <div className={`shrink-0 border-t border-line bg-surface ${compacto ? 'p-2' : 'p-3'}`}>
        <button onClick={alternarMenu} className="mb-1 hidden w-full items-center gap-3 rounded border border-line px-3 py-2 text-sm font-medium text-ink transition hover:border-primary hover:bg-primary-tint hover:text-primary md:flex"><PanelLeftClose size={18} /> Esconder menu</button>
        <button onClick={alternarTema} title={compacto ? (escuro ? 'Modo claro' : 'Modo escuro') : undefined} aria-label={escuro ? 'Ativar modo claro' : 'Ativar modo escuro'} className={`mb-1 flex w-full items-center rounded py-2 text-sm text-muted transition hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}>{escuro ? <Sun size={18} /> : <Moon size={18} />}{!compacto && (escuro ? 'Modo claro' : 'Modo escuro')}</button>
        <button onClick={limparCache} title={compacto ? 'Limpar cache' : undefined} className={`mb-1 flex w-full items-center rounded py-2 text-sm text-muted transition hover:bg-canvas ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}><Eraser size={18} />{!compacto && 'Limpar cache'}</button>
        <Link href="/perfil" title={compacto ? 'Meu perfil' : undefined} className={`mb-1 flex w-full items-center rounded py-2 text-sm transition ${pathname.startsWith('/perfil') ? 'bg-primary-tint font-medium text-primary' : 'text-muted hover:bg-canvas'} ${compacto ? 'justify-center px-2' : 'gap-3 px-3'}`}><CircleUserRound size={18} />{!compacto && 'Meu perfil'}</Link>
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
      {menuMinimizado ? (
        // Menu escondido: sobra só uma faixa estreita com o botão para trazê-lo de volta.
        <div className="hidden h-screen w-12 shrink-0 flex-col items-center border-r border-line bg-surface py-3 md:flex print:hidden">
          <button onClick={alternarMenu} title="Mostrar menu" aria-label="Mostrar menu lateral" className="flex flex-col items-center gap-1 rounded-lg border border-primary/40 bg-primary-tint px-1.5 py-2 text-[10px] font-medium text-primary shadow-sm hover:bg-primary hover:text-white"><PanelLeftOpen size={20} /> Menu</button>
        </div>
      ) : (
        <aside className="hidden h-screen w-60 shrink-0 flex-col overflow-hidden border-r border-line bg-surface md:flex print:hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-baseline gap-1.5">
              <Logo size={30} />
              <span className="text-[10px] font-medium text-muted">v{APP_VERSION}</span>
            </div>
          </div>
          {navContent(false)}
        </aside>
      )}

      {/* Drawer + overlay (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuAberto(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-200 md:hidden print:hidden ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <div className="flex items-baseline gap-1.5">
            <Logo size={28} />
            <span className="text-[10px] font-medium text-muted">v{APP_VERSION}</span>
          </div>
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
          <div className="flex items-baseline gap-1.5">
            <Logo size={24} />
            <span className="text-[10px] font-medium text-muted">v{APP_VERSION}</span>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
