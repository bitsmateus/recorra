/** Remove tudo que não é dígito (CPF/CNPJ, telefone). */
export function onlyDigits(v: string): string {
  return (v ?? '').replace(/\D+/g, '');
}

/** Normaliza telefone para E.164 brasileiro sem '+' (ex.: 5511999999999). */
export function normalizePhoneBR(v: string): string | undefined {
  const d = onlyDigits(v);
  if (d.length < 10) return undefined;
  return d.startsWith('55') ? d : `55${d}`;
}

/**
 * Normaliza um número para envio no WhatsApp Brasil: DDI 55 + DDD + celular
 * COM o 9º dígito. Corrige o caso mais comum de falha "131026 (destinatário
 * indisponível/sem WhatsApp)": números vindos do ERP no formato antigo
 * (DDD + 8 dígitos, sem o 9) — insere o 9 quando o número local começa por 6–9
 * (faixa de celular). Não mexe em fixos (começam por 2–5) para não inventar 9.
 * Retorna undefined se for curto demais para ser um telefone válido.
 *
 * Comprimentos esperados: com DDI 13 (55+DDD+9) ou 12 (55+DDD+8, sem 9);
 * sem DDI 11 (DDD+9) ou 10 (DDD+8). O DDI só é removido em 12/13 dígitos, para
 * não confundir com o DDD 55 (ex.: "55999999999" = DDD 55, não DDI).
 */
export function normalizeWhatsappBR(v: string): string | undefined {
  let d = onlyDigits(v);
  if (d.length < 10) return undefined;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    const local = d.slice(2);
    if (/^[6-9]/.test(local)) d = `${ddd}9${local}`;
  }
  return `55${d}`;
}

/** Converte valores com vírgula decimal ("99,90") em number. */
export function parseMoney(v: string | number): number {
  if (typeof v === 'number') return v;
  return Number((v ?? '0').toString().replace(/\./g, '').replace(',', '.')) || 0;
}
