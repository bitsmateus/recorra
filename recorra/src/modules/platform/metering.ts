/** Medição de uso e cálculo de fatura do SaaS — puro e testável. */

import { getPlan, PlanTier } from './plans';
import { round2 } from '@/modules/billing/agreement';

export interface Usage {
  clientes: number;
  disparos: number; // no mês
  cobrancas?: number;
}

export interface SaasBill {
  tier: PlanTier;
  base: number;
  disparosInclusos: number;
  disparosExcedentes: number;
  valorExcedente: number;
  total: number;
}

/** Calcula a fatura do mês: base do plano + excedente de disparos. */
export function computeSaasBill(tier: PlanTier, usage: Usage): SaasBill {
  const plan = getPlan(tier);
  const excedentes = Math.max(0, usage.disparos - plan.disparosInclusos);
  const valorExcedente = round2(excedentes * plan.custoExcedente);
  return {
    tier,
    base: plan.preco,
    disparosInclusos: plan.disparosInclusos,
    disparosExcedentes: excedentes,
    valorExcedente,
    total: round2(plan.preco + valorExcedente),
  };
}

export interface LimitCheck {
  clientesOk: boolean;
  usuariosOk: boolean;
  avisos: string[];
}

/** Verifica se o uso está dentro dos limites do plano. */
export function checkLimits(tier: PlanTier, usage: Usage & { usuarios?: number }): LimitCheck {
  const plan = getPlan(tier);
  const avisos: string[] = [];
  const clientesOk = plan.maxClientes < 0 || usage.clientes <= plan.maxClientes;
  const usuariosOk = plan.maxUsuarios < 0 || (usage.usuarios ?? 0) <= plan.maxUsuarios;
  if (!clientesOk) avisos.push(`Limite de clientes do plano (${plan.maxClientes}) excedido: ${usage.clientes}.`);
  if (!usuariosOk) avisos.push(`Limite de usuários do plano (${plan.maxUsuarios}) excedido.`);
  // aviso de proximidade (>= 80%)
  if (plan.maxClientes > 0 && usage.clientes >= plan.maxClientes * 0.8 && clientesOk) {
    avisos.push('Você está próximo do limite de clientes do plano.');
  }
  return { clientesOk, usuariosOk, avisos };
}
