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

/** Converte valores com vírgula decimal ("99,90") em number. */
export function parseMoney(v: string | number): number {
  if (typeof v === 'number') return v;
  return Number((v ?? '0').toString().replace(/\./g, '').replace(',', '.')) || 0;
}
