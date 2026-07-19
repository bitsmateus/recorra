/**
 * Recorte de datas para os filtros de período.
 *
 * O painel manda datas soltas (`YYYY-MM-DD`) — o calendário de quem está
 * olhando a tela. O container da API roda em UTC (`node:20-slim`, sem `TZ`),
 * então interpretar essas datas no fuso do servidor jogaria o início do dia
 * para as 21h do dia anterior e o filtro pegaria linhas erradas nas duas
 * pontas. O fuso certo é o do tenant (`tenant.timezone`), o mesmo que a régua
 * já usa para decidir a janela de envio.
 */
const PADRAO = 'America/Sao_Paulo';

/** Offset do fuso ("-03:00") na data indicada, respeitando horário de verão. */
function offset(iso: string, timezone: string): string {
  const ref = new Date(`${iso}T12:00:00Z`); // meio-dia: longe da virada do dia
  if (Number.isNaN(ref.getTime())) return '+00:00';
  try {
    const nome = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(ref)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
    // "GMT-03:00" -> "-03:00". Em UTC o nome vem só como "GMT", sem offset.
    return nome.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? '+00:00';
  } catch {
    return '+00:00'; // fuso inválido no cadastro: não derruba o dashboard
  }
}

function data(iso: string | undefined, hora: string, timezone: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T${hora}${offset(iso, timezone)}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Intervalo a partir de dois `YYYY-MM-DD` vindos da query. As duas pontas são
 * inclusivas. Data inválida é ignorada em vez de virar `Invalid Date` no where.
 */
export function intervaloDatas(de?: string, ate?: string, timezone: string = PADRAO): { gte?: Date; lte?: Date } | undefined {
  const inicio = data(de, '00:00:00.000', timezone);
  const fim = data(ate, '23:59:59.999', timezone);
  if (!inicio && !fim) return undefined;
  return { ...(inicio && { gte: inicio }), ...(fim && { lte: fim }) };
}

/** Primeiro instante do mês corrente no fuso do tenant. */
export function inicioDoMes(ref = new Date(), timezone: string = PADRAO): Date {
  // 'sv-SE' formata como YYYY-MM-DD, que é o recorte que precisamos.
  let dia: string;
  try {
    dia = ref.toLocaleDateString('sv-SE', { timeZone: timezone });
  } catch {
    dia = ref.toLocaleDateString('sv-SE');
  }
  const [ano, mes] = dia.split('-');
  return data(`${ano}-${mes}-01`, '00:00:00.000', timezone)!;
}

/**
 * Intervalo por vencimento — borda em UTC, não no fuso do tenant.
 *
 * Vencimento é uma data-only ("dia 15"), gravada à meia-noite UTC (o container
 * roda em UTC). Recortar com o fuso do tenant (−03:00) empurraria a fatura do
 * dia 1º, gravada em `01T00:00Z`, para as 21h do dia 30 anterior — jogando-a no
 * mês errado. Aqui as duas pontas ficam no mesmo referencial em que o dado foi
 * gravado: UTC.
 */
export function intervaloVencimento(de?: string, ate?: string): { gte?: Date; lte?: Date } | undefined {
  const inicio = dataUtc(de, '00:00:00.000');
  const fim = dataUtc(ate, '23:59:59.999');
  if (!inicio && !fim) return undefined;
  return { ...(inicio && { gte: inicio }), ...(fim && { lte: fim }) };
}

function dataUtc(iso: string | undefined, hora: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T${hora}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Primeiro dia do mês corrente em UTC — padrão do filtro por vencimento. */
export function inicioDoMesUtc(ref = new Date()): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

/** Chave `YYYY-MM` usada para agrupar por mês. */
export function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
