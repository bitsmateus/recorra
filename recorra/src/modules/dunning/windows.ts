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

/** Componentes de data/hora de um instante num fuso (via Intl). */
function tzParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: p.hour === '24' ? 0 : Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

/** Offset do fuso (ms) no instante `d`: (relógio local do fuso) − UTC. */
function tzOffsetMs(d: Date, timeZone: string): number {
  const p = tzParts(d, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - d.getTime();
}

/**
 * Instante UTC de "`hora`:00 no fuso do tenant" no dia (hoje-no-fuso + `addDias`).
 * `nextAllowedSlot` devolve o slot em termos do fuso do tenant; esta função o
 * materializa no instante absoluto correto — sem isto, gravar via `setHours`
 * usaria o fuso do servidor (UTC no deploy) e enviaria fora da janela.
 * Corrige o offset em 2 passes para cobrir bordas de horário de verão.
 */
export function zonedSlotToUtc(base: Date, timeZone: string, addDias: number, hora: number): Date {
  const p = tzParts(base, timeZone);
  // "relógio de parede" alvo tratado como se fosse UTC (Date.UTC normaliza a virada de mês).
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day + addDias, hora, 0, 0);
  let inst = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), timeZone);
  inst = wallAsUtc - tzOffsetMs(new Date(inst), timeZone);
  return new Date(inst);
}

/**
 * Empurra um instante para dentro da janela de envio: devolve o próprio instante
 * se já é permitido, senão o início do próximo slot válido (no fuso do tenant).
 *
 * É o que sustenta o espaçamento entre mensagens: o motor avança um cursor de
 * `delaySegundos` a cada disparo e passa por aqui: quando o lote encosta no fim
 * do dia, o restante cai no início do próximo dia útil em vez de sair de
 * madrugada — hora em que cobrança nem pode ser feita.
 */
export function dentroDaJanelaOuProximo(d: Date, timeZone: string, cfg: WindowConfig): Date {
  const p = tzParts(d, timeZone);
  // Dia da semana do calendário LOCAL: montar como UTC evita o fuso do servidor.
  const diaSemana = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  if (isWithinWindow(p.hour, diaSemana, cfg)) return d;
  const slot = nextAllowedSlot(p.hour, diaSemana, cfg);
  return zonedSlotToUtc(d, timeZone, slot.addDias, slot.hora);
}

/** Verdadeiro se ainda cabe envio no limite diário (0/undefined = sem limite). */
export function withinDailyLimit(enviadosHoje: number, maxPorDia?: number | null): boolean {
  if (!maxPorDia || maxPorDia <= 0) return true;
  return enviadosHoje < maxPorDia;
}
