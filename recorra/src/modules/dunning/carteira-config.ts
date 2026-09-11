/**
 * Configuração de faixas da esteira por carteira/equipe.
 * Fica em `Tenant.config.carteira` (mesmo padrão de Tenant.config.pagamentoRecebido).
 */
export interface CarteiraConfig {
  /** A partir deste dia de atraso (inclusive) o cliente passa para a EQUIPE_2 (retenção). Antes disso é EQUIPE_1. */
  equipe2DesdeDia: number;
  /** Dia de atraso a partir do qual a esteira sinaliza "rescisão pendente". Só alerta — nada é acionado automaticamente. */
  diasRescisao: number;
  /** Dia de atraso a partir do qual a esteira sinaliza "enviar ao Serasa". Só alerta — nada é acionado automaticamente. */
  diasSerasa: number;
}

export const CARTEIRA_CONFIG_PADRAO: CarteiraConfig = {
  equipe2DesdeDia: 30,
  diasRescisao: 77,
  diasSerasa: 85,
};

/** Lê a configuração de carteira de um `Tenant.config` cru, aplicando os padrões. */
export function lerCarteiraConfig(config: unknown): CarteiraConfig {
  const cfg = (config ?? {}) as { carteira?: Partial<CarteiraConfig> };
  const c = { ...CARTEIRA_CONFIG_PADRAO, ...(cfg.carteira ?? {}) };
  // Defesa contra valor salvo inválido (ex.: 0, negativo, NaN de uma edição malformada).
  const inteiroPositivo = (v: number, fallback: number) => (Number.isInteger(v) && v > 0 ? v : fallback);
  return {
    equipe2DesdeDia: inteiroPositivo(c.equipe2DesdeDia, CARTEIRA_CONFIG_PADRAO.equipe2DesdeDia),
    diasRescisao: inteiroPositivo(c.diasRescisao, CARTEIRA_CONFIG_PADRAO.diasRescisao),
    diasSerasa: inteiroPositivo(c.diasSerasa, CARTEIRA_CONFIG_PADRAO.diasSerasa),
  };
}

/** Qual equipe atende um cliente com este tanto de dias de atraso. */
export function equipeDaFaixa(diffDias: number, cfg: CarteiraConfig): 'EQUIPE_1' | 'EQUIPE_2' {
  return diffDias >= cfg.equipe2DesdeDia ? 'EQUIPE_2' : 'EQUIPE_1';
}
