/** Geração de CSV para exportação — pura e testável. */

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Monta um CSV a partir de cabeçalhos e linhas (array de objetos). */
export function toCsv(headers: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const head = headers.map((h) => escapeCell(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h.key])).join(',')).join('\n');
  return body ? `${head}\n${body}` : head;
}
