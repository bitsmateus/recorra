/** Catálogo de planos do SaaS Recorrai — puro e testável. */

export type PlanTier = 'TRIAL' | 'NOTIFICADOR' | 'ESSENCIAL' | 'PROFISSIONAL' | 'ESCALA' | 'ENTERPRISE';

export type Feature =
  | 'cobranca' // gerar cobrança no gateway
  | 'ia_risco' // score de risco
  | 'reguas_por_risco'
  | 'ia_completa' // ML + chatbot
  | 'multi_gateway'
  | 'api_ingestao';

export interface Plan {
  tier: PlanTier;
  nome: string;
  preco: number; // mensalidade base (R$)
  maxClientes: number; // -1 = ilimitado
  disparosInclusos: number;
  custoExcedente: number; // R$/msg acima do incluso
  maxUsuarios: number;
  features: Feature[];
}

export const PLANS: Record<PlanTier, Plan> = {
  TRIAL: { tier: 'TRIAL', nome: 'Trial', preco: 0, maxClientes: 30, disparosInclusos: 50, custoExcedente: 0, maxUsuarios: 1, features: ['ia_risco'] },
  NOTIFICADOR: { tier: 'NOTIFICADOR', nome: 'Notificador', preco: 67, maxClientes: 500, disparosInclusos: 1500, custoExcedente: 0.1, maxUsuarios: 2, features: [] },
  ESSENCIAL: { tier: 'ESSENCIAL', nome: 'Essencial', preco: 127, maxClientes: 500, disparosInclusos: 1500, custoExcedente: 0.1, maxUsuarios: 3, features: ['cobranca', 'ia_risco'] },
  PROFISSIONAL: { tier: 'PROFISSIONAL', nome: 'Profissional', preco: 297, maxClientes: 1500, disparosInclusos: 5000, custoExcedente: 0.09, maxUsuarios: 5, features: ['cobranca', 'ia_risco', 'reguas_por_risco', 'multi_gateway', 'api_ingestao'] },
  ESCALA: { tier: 'ESCALA', nome: 'Escala', preco: 597, maxClientes: 6000, disparosInclusos: 20000, custoExcedente: 0.08, maxUsuarios: 15, features: ['cobranca', 'ia_risco', 'reguas_por_risco', 'ia_completa', 'multi_gateway', 'api_ingestao'] },
  ENTERPRISE: { tier: 'ENTERPRISE', nome: 'Enterprise', preco: 0, maxClientes: -1, disparosInclusos: 0, custoExcedente: 0.07, maxUsuarios: -1, features: ['cobranca', 'ia_risco', 'reguas_por_risco', 'ia_completa', 'multi_gateway', 'api_ingestao'] },
};

export function getPlan(tier: PlanTier): Plan {
  return PLANS[tier] ?? PLANS.TRIAL;
}

/** Verdadeiro se a feature está incluída no plano (respeitando overrides). */
export function featureEnabled(tier: PlanTier, feature: Feature, overrides?: Partial<Record<Feature, boolean>>): boolean {
  if (overrides && feature in overrides) return !!overrides[feature];
  return getPlan(tier).features.includes(feature);
}
