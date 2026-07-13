/** Janela de envio e limites anti-spam — lógica pura e testável. */

export interface WindowConfig {
  inicioHora: number; // 0-23 (ex.: 9)
  fimHora: number; // 0-23 (ex.: 20) — exclusivo no minuto final
  diasUteisSomente: boolean; // exclui sábado/domingo
}

/**
 * Verdadeiro se o horário está dentro da janela permitida.
 * `hora` 0-23, `diaSemana` 0=domingo ... 6=sábado (no fuso do tenant).
 */
export function isWithinWindow(hora: number, diaSemana: number, cfg: WindowConfig): boolean {
  if (cfg.diasUteisSomente && (diaSemana === 0 || diaSemana === 6)) return false;
  return hora >= cfg.inicioHora && hora < cfg.fimHora;
}

/**
 * Próxima hora permitida (mesmo dia se antes do início; senão início do próximo
 * dia útil válido). Retorna { addDias, hora } para o chamador aplicar no fuso.
 */
export function nextAllowedSlot(hora: number, diaSemana: number, cfg: WindowConfig): { addDias: number; hora: number } {
  // já dentro
  if (isWithinWindow(hora, diaSemana, cfg)) return { addDias: 0, hora };

  // ainda antes do início, hoje é dia válido
  const diaValido = !(cfg.diasUteisSomente && (diaSemana === 0 || diaSemana === 6));
  if (hora < cfg.inicioHora && diaValido) return { addDias: 0, hora: cfg.inicioHora };

  // procura o próximo dia válido
  for (let add = 1; add <= 7; add++) {
    const d = (diaSemana + add) % 7;
    if (!(cfg.diasUteisSomente && (d === 0 || d === 6))) return { addDias: add, hora: cfg.inicioHora };
  }
  return { addDias: 1, hora: cfg.inicioHora };
}

/** Verdadeiro se ainda cabe envio no limite diário (0/undefined = sem limite). */
export function withinDailyLimit(enviadosHoje: number, maxPorDia?: number | null): boolean {
  if (!maxPorDia || maxPorDia <= 0) return true;
  return enviadosHoje < maxPorDia;
}
