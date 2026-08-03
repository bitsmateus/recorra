/**
 * Janela de importação do ERP.
 *
 * ERPs de provedor guardam o título em aberto para sempre: ao conectar, o primeiro
 * sync traz o passivo histórico inteiro — faturas vencidas há anos, de contratos
 * que já foram cancelados. Isso polui a esteira, o dashboard e o score de risco, e
 * cria o risco real de disparar cobrança em massa para dívida antiga.
 *
 * `diasHistorico` limita o que ENTRA: só faturas com vencimento dentro dos últimos
 * N dias viram cobrança nova. `null` = sem limite (comportamento antigo).
 */

/** Quantos dias de histórico uma integração nova importa por padrão. */
export const DIAS_HISTORICO_PADRAO = 90;

/** Teto aceito no formulário — acima disso a janela deixa de ter sentido. */
export const DIAS_HISTORICO_MAX = 3650;

/**
 * Data de corte: vencimentos anteriores a ela ficam de fora. Normalizada para a
 * meia-noite UTC do dia, porque `Invoice.vencimento` é gravado por dia (sem hora)
 * — comparar com o instante atual excluiria o próprio dia do corte.
 */
export function dataCorte(diasHistorico: number | null | undefined, ref: Date = new Date()): Date | null {
  if (diasHistorico == null || !Number.isFinite(diasHistorico) || diasHistorico < 0) return null;
  const corte = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  corte.setUTCDate(corte.getUTCDate() - Math.floor(diasHistorico));
  return corte;
}

/**
 * A fatura entra na janela? Sem corte, tudo entra. Vencimento inválido também
 * entra: descartar por data ilegível esconderia cobrança boa em silêncio — o
 * lugar de barrar dado quebrado é a validação do conector, não a janela.
 */
export function dentroDaJanela(vencimento: Date, corte: Date | null): boolean {
  if (!corte) return true;
  if (Number.isNaN(vencimento.getTime())) return true;
  const dia = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  return dia >= corte.getTime();
}
