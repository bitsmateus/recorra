import { onlyDigits } from './normalize';

/**
 * Validadores puros (sem framework/banco) — testáveis isoladamente.
 * Validam dígitos verificadores reais de CPF/CNPJ, E.164 e e-mail.
 */

/** Valida CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCPF(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais

  const calc = (base: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factorStart - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Valida CNPJ pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCNPJ(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calc(12);
  const d2 = calc(13);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) conforme o tamanho. */
export function isValidCpfCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length === 11) return isValidCPF(d);
  if (d.length === 14) return isValidCNPJ(d);
  return false;
}

/** Validação de e-mail (formato prático, não RFC completo). */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * Normaliza e valida telefone BR para E.164 sem '+'.
 * Retorna o número (ex.: 5511999999999) ou null se inválido.
 * Aceita fixo (10 dígitos) e celular (11 dígitos), com/sem DDI 55.
 */
export function toE164BR(input: string): string | null {
  let d = onlyDigits(input);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  // agora d deve ter 10 (fixo) ou 11 (celular) dígitos com DDD
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null; // celular começa com 9
  return `55${d}`;
}
