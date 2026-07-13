import { describe, it, expect } from 'vitest';
import { isValidCPF, isValidCNPJ, isValidCpfCnpj, isValidEmail, toE164BR } from '@/common/util/validators';

describe('CPF', () => {
  it('aceita CPFs válidos (com e sem máscara)', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
    expect(isValidCPF('111.444.777-35')).toBe(true);
  });
  it('rejeita CPFs inválidos', () => {
    expect(isValidCPF('52998224724')).toBe(false); // dígito errado
    expect(isValidCPF('11111111111')).toBe(false); // todos iguais
    expect(isValidCPF('123')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('aceita CNPJs válidos', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11222333000181')).toBe(true);
  });
  it('rejeita CNPJs inválidos', () => {
    expect(isValidCNPJ('11222333000180')).toBe(false);
    expect(isValidCNPJ('00000000000000')).toBe(false);
  });
});

describe('isValidCpfCnpj', () => {
  it('despacha por tamanho', () => {
    expect(isValidCpfCnpj('52998224725')).toBe(true);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
    expect(isValidCpfCnpj('123456')).toBe(false);
  });
});

describe('e-mail', () => {
  it('valida formatos comuns', () => {
    expect(isValidEmail('joao@email.com')).toBe(true);
    expect(isValidEmail('a.b+x@sub.dominio.com.br')).toBe(true);
  });
  it('rejeita inválidos', () => {
    expect(isValidEmail('sem-arroba')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('telefone E.164 BR', () => {
  it('normaliza celular e fixo', () => {
    expect(toE164BR('(11) 99999-9999')).toBe('5511999999999');
    expect(toE164BR('11 3333-4444')).toBe('551133334444');
    expect(toE164BR('5511999999999')).toBe('5511999999999');
  });
  it('rejeita inválidos', () => {
    expect(toE164BR('999')).toBeNull();
    expect(toE164BR('0011999999999')).toBeNull(); // DDD 00
    expect(toE164BR('11088887777')).toBeNull(); // 11 dígitos sem 9
  });
});
