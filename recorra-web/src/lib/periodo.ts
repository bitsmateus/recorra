export type PeriodoChave = '7d' | '15d' | '30d' | '90d' | 'mes' | 'mes-passado' | 'ano' | 'custom';

export const PERIODOS: { chave: PeriodoChave; label: string }[] = [
  { chave: '7d', label: '7 dias' },
  { chave: '15d', label: '15 dias' },
  { chave: '30d', label: '30 dias' },
  { chave: '90d', label: '90 dias' },
  { chave: 'mes', label: 'Este mês' },
  { chave: 'mes-passado', label: 'Mês passado' },
  { chave: 'ano', label: 'Este ano' },
  { chave: 'custom', label: 'Personalizado' },
];

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Converte um preset no intervalo `de`/`ate` que vai para a API.
 *
 * Os presets de dias incluem hoje ("7 dias" = hoje e os 6 anteriores). O cálculo
 * é feito aqui, no navegador, porque é o calendário do usuário que define o que
 * "este mês" significa — o servidor só recebe as duas datas já resolvidas.
 */
export function intervaloDe(chave: PeriodoChave, hoje = new Date()): { de: string; ate: string } | null {
  const ate = iso(hoje);
  const dias = (n: number) => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (n - 1)));

  switch (chave) {
    case '7d': return { de: dias(7), ate };
    case '15d': return { de: dias(15), ate };
    case '30d': return { de: dias(30), ate };
    case '90d': return { de: dias(90), ate };
    case 'mes': return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate };
    case 'mes-passado': return {
      de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
      ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)), // dia 0 = último dia do mês anterior
    };
    case 'ano': return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate };
    default: return null; // custom: quem manda são os campos de data
  }
}

export function rotuloPeriodo(chave: PeriodoChave, de: string, ate: string): string {
  if (chave !== 'custom') return PERIODOS.find((p) => p.chave === chave)!.label.toLowerCase();
  // "Personalizado" sem data nenhuma não manda filtro, e aí a API cai no padrão
  // dela: o mês corrente. O rótulo precisa dizer isso, não "todo o período".
  if (!de && !ate) return 'este mês';
  const br = (s: string) => s.split('-').reverse().join('/');
  if (de && ate) return `${br(de)} a ${br(ate)}`;
  return de ? `desde ${br(de)}` : `até ${br(ate)}`;
}
