/** Substitui variáveis {{chave}} no template pela mensagem final. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

/** Substitui variáveis posicionais {{1}}, {{2}}... pelos parâmetros na ordem (para exibição). */
export function renderPositional(template: string, params: string[]): string {
  return template.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? '');
}

/** Formata número como moeda BRL. */
export function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata data como dd/mm/aaaa. */
export function dateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
