/** Geração de CSV para exportação — pura e testável. */

function escapeCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Anti CSV/Formula injection: neutraliza células que o Excel/Sheets
  // interpretaria como fórmula (=, +, -, @, tab, CR) prefixando com apóstrofo.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Monta um CSV a partir de cabeçalhos e linhas (array de objetos). */
export function toCsv(headers: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const head = headers.map((h) => escapeCell(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h.key])).join(',')).join('\n');
  return body ? `${head}\n${body}` : head;
}
