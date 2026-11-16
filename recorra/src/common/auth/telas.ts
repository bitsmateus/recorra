/**
 * Telas do painel que cada pessoa pode ver. Quem administra escolhe por usuário
 * (Equipe → Telas); sem escolha, vale o padrão do papel. "Meu perfil" e a
 * Central de Ajuda são sempre visíveis e não entram aqui.
 */
export const TELAS = [
  { chave: 'dashboard', nome: 'Dashboard' },
  { chave: 'clientes', nome: 'Clientes' },
  { chave: 'cobrancas', nome: 'Cobranças (todas)' },
  { chave: 'campanhas', nome: 'Campanhas' },
  { chave: 'disparos', nome: 'Disparos' },
  { chave: 'reguas', nome: 'Réguas e carteiras' },
  { chave: 'esteira', nome: 'Esteira' },
  { chave: 'relatorios', nome: 'Relatórios' },
  { chave: 'integracoes', nome: 'Integrações' },
  { chave: 'canais', nome: 'Canais' },
  { chave: 'templates', nome: 'Templates WhatsApp' },
  { chave: 'modelos-email', nome: 'Modelos de e-mail' },
  { chave: 'equipe', nome: 'Equipe' },
  { chave: 'api', nome: 'API' },
  { chave: 'plano', nome: 'Plano' },
] as const;

export type Tela = (typeof TELAS)[number]['chave'];
const TODAS = TELAS.map((t) => t.chave) as Tela[];

/**
 * Padrão por papel. Operador/leitura (atendente de cobrança) trabalha só o que é
 * dele: painel próprio, os clientes sob sua responsabilidade, a esteira e os
 * disparos dos seus clientes — nunca configurações, réguas, cobranças gerais nem
 * relatórios gerais (salvo se quem administra liberar).
 */
export function telasPadrao(role: string): Tela[] {
  if (role === 'OPERADOR' || role === 'LEITURA') return ['dashboard', 'clientes', 'esteira', 'disparos'];
  return [...TODAS];
}

/** Telas que valem para o usuário: as escolhidas (se personalizadas) ou as do papel. OWNER vê tudo, sempre. */
export function telasEfetivas(u: { role: string; telas?: string[] | null; telasCustom?: boolean | null }): Tela[] {
  if (u.role === 'OWNER') return [...TODAS];
  if (u.telasCustom) return TODAS.filter((t) => (u.telas ?? []).includes(t));
  return telasPadrao(u.role);
}

/** Papéis que enxergam apenas os próprios dados (clientes/disparos/painel) por padrão. */
export const somenteProprios = (role: string) => role === 'OPERADOR' || role === 'LEITURA';
