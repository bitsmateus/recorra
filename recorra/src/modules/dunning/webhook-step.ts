import { renderTemplate } from './template.util';

/** Variáveis que o corpo JSON de um passo Webhook pode usar. */
export const VARIAVEIS_WEBHOOK = ['nomeCompleto', 'nome', 'placa', 'valorNumero', 'valor', 'vencimento', 'idExterno', 'cpf', 'contrato'] as const;

/** Valor no formato brasileiro sem moeda, ex.: 391.3 -> "391,30". */
export function valorNumero(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

function aplicar(node: unknown, vars: Record<string, string>): unknown {
  if (typeof node === 'string') return renderTemplate(node, vars);
  if (Array.isArray(node)) return node.map((n) => aplicar(n, vars));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, aplicar(v, vars)]));
  }
  return node;
}

/**
 * Monta o corpo do webhook. As variáveis entram nos VALORES do JSON já parseado,
 * então aspas ou barras num nome de cliente não quebram o JSON enviado.
 */
export function renderWebhookBody(template: string, vars: Record<string, string>): string {
  return JSON.stringify(aplicar(JSON.parse(template), vars));
}

/** Erro de configuração do passo (ou null se está ok). Roda ao salvar a régua. */
export function erroPassoWebhook(webhookUrl: string | undefined | null, template: string): string | null {
  try {
    const u = new URL((webhookUrl ?? '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocolo');
  } catch {
    return 'Webhook: informe uma URL válida (https://...).';
  }
  try {
    const j = JSON.parse(template);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return 'Webhook: o corpo precisa ser um objeto JSON.';
  } catch {
    return 'Webhook: o corpo não é um JSON válido.';
  }
  return null;
}
