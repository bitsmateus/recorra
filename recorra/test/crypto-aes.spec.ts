import { describe, it, expect } from 'vitest';
import { encryptWith, decryptWith } from '@/common/crypto/aes';

describe('aes encryptWith/decryptWith', () => {
  it('faz round-trip e não vaza o texto claro', () => {
    const key = 'chave-de-teste-com-mais-de-32-bytes-aqui';
    const enc = encryptWith(key, 'segredo-do-tenant');
    expect(enc).not.toContain('segredo');
    expect(enc.split('.')).toHaveLength(3); // iv.tag.ct
    expect(decryptWith(key, enc)).toBe('segredo-do-tenant');
  });

  it('decifra com a chave errada falha (base da rotação: tenta nova, cai pra antiga)', () => {
    const enc = encryptWith('chave-antiga-aaaaaaaaaaaaaaaaaaaaaaaa', 'x');
    expect(() => decryptWith('chave-nova-bbbbbbbbbbbbbbbbbbbbbbbbbb', enc)).toThrow();
    expect(decryptWith('chave-antiga-aaaaaaaaaaaaaaaaaaaaaaaa', enc)).toBe('x');
  });
});
