/**
 * Alertas (dias de atraso) da esteira, tenant-wide — independentes de carteira.
 * Fica em `Tenant.config.alertasEsteira` (mesmo padrão de Tenant.config.pagamentoRecebido).
 */
export interface AlertasEsteiraConfig {
  /** Dia de atraso a partir do qual a esteira sinaliza "rescisão pendente". Só alerta — nada é acionado automaticamente. */
  diasRescisao: number;
  /** Dia de atraso a partir do qual a esteira sinaliza "enviar ao Serasa". Só alerta — nada é acionado automaticamente. */
  diasSerasa: number;
}

export const ALERTAS_ESTEIRA_PADRAO: AlertasEsteiraConfig = {
  diasRescisao: 77,
  diasSerasa: 85,
};

/** Lê os alertas de um `Tenant.config` cru, aplicando os padrões. */
export function lerAlertasEsteira(config: unknown): AlertasEsteiraConfig {
  const cfg = (config ?? {}) as { alertasEsteira?: Partial<AlertasEsteiraConfig> };
  const c = { ...ALERTAS_ESTEIRA_PADRAO, ...(cfg.alertasEsteira ?? {}) };
  // Defesa contra valor salvo inválido (ex.: 0, negativo, NaN de uma edição malformada).
  const inteiroPositivo = (v: number, fallback: number) => (Number.isInteger(v) && v > 0 ? v : fallback);
  return {
    diasRescisao: inteiroPositivo(c.diasRescisao, ALERTAS_ESTEIRA_PADRAO.diasRescisao),
    diasSerasa: inteiroPositivo(c.diasSerasa, ALERTAS_ESTEIRA_PADRAO.diasSerasa),
  };
}
