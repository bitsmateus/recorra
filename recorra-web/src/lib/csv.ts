/**
 * Geração de CSV no navegador, à prova de injeção de fórmula: campos que começam
 * com = + - @ (ou tab/CR) ganham um apóstrofo, senão o Excel/Sheets executaria
 * como fórmula ao abrir. Aspas duplicadas e separador tratados no padrão RFC 4180.
 */
function celula(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",;\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], linhas: (string | number | null | undefined)[][]): string {
  const corpo = linhas.map((l) => l.map(celula).join(';')).join('\n');
  // BOM para o Excel abrir com acentuação correta (UTF-8).
  return '﻿' + [headers.map(celula).join(';'), corpo].filter(Boolean).join('\n');
}

/** Dispara o download de um texto como arquivo. */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
