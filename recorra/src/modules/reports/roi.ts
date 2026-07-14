/** Custo de comunicação e ROI — puros e testáveis. */

import { round2 } from '@/modules/billing/agreement';

/** Custo por canal (R$/msg). Ajustável por tenant. */
export const CUSTO_CANAL: Record<string, number> = {
  WHATSAPP_CLOUD: 0.1,
  WHATSAPP_EVOLUTION: 0.0,
  WHATSAPP_UAZAPI: 0.0,
  EMAIL: 0.001,
  SMS: 0.12,
  HTTP_GENERIC: 0.0,
  NX_SYSTEMS: 0.0,
};

export interface CanalVolume {
  canal: string;
  quantidade: number;
  custoUnit?: number; // sobrescreve a tabela padrão
}

/** Custo total de comunicação a partir do volume por canal. */
export function custoComunicacao(volumes: CanalVolume[]): number {
  const total = volumes.reduce((s, v) => {
    const unit = v.custoUnit ?? CUSTO_CANAL[v.canal] ?? 0;
    return s + unit * v.quantidade;
  }, 0);
  return round2(total);
}

export interface RoiResult {
  custo: number;
  recuperado: number;
  lucro: number;
  roi: number; // (recuperado - custo) / custo
  retornoPorReal: number; // recuperado / custo
}

/** ROI da operação de cobrança. */
export function computeRoi(custo: number, recuperado: number): RoiResult {
  const c = round2(custo);
  const r = round2(recuperado);
  return {
    custo: c,
    recuperado: r,
    lucro: round2(r - c),
    roi: c > 0 ? round2((r - c) / c) : 0,
    retornoPorReal: c > 0 ? round2(r / c) : 0,
  };
}
