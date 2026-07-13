/**
 * Categorização de template do WhatsApp (utility/marketing/authentication).
 * Heurística pura para orientar o custo (utility é bem mais barato que marketing).
 */

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

const MARKETING = ['promo', 'promoção', 'desconto', 'oferta', 'aproveite', 'novidade', 'imperdível', 'black friday', 'cupom', 'condição especial', 'upgrade'];
const AUTH = ['código', 'codigo', 'otp', 'verificação', 'verificacao', 'token', 'autenticação', 'autenticacao', 'senha temporária'];

/**
 * Classifica o texto do template. Autenticação tem prioridade (código/OTP),
 * depois marketing (termos promocionais); o resto é utility (cobrança, avisos).
 */
export function categorizeTemplate(texto: string): TemplateCategory {
  const t = (texto ?? '').toLowerCase();
  if (AUTH.some((k) => t.includes(k))) return 'AUTHENTICATION';
  if (MARKETING.some((k) => t.includes(k))) return 'MARKETING';
  return 'UTILITY';
}

/** Custo relativo estimado (para alertar quando um template de cobrança cair em marketing). */
export function isCobrancaButMarketing(texto: string): boolean {
  const t = (texto ?? '').toLowerCase();
  const pareceCobranca = ['fatura', 'vencimento', 'vence', 'pagamento', 'pix', 'boleto', 'em aberto', 'atraso'].some((k) => t.includes(k));
  return pareceCobranca && categorizeTemplate(texto) === 'MARKETING';
}
