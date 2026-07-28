import { describe, it, expect } from 'vitest';
import { normalizeWhatsappBR } from '../src/common/util/normalize';

describe('normalizeWhatsappBR', () => {
  it('insere o 9 em celular antigo (DDD + 8 dígitos)', () => {
    expect(normalizeWhatsappBR('6281112677')).toBe('5562981112677');
    expect(normalizeWhatsappBR('11988887777')).toBe('5511988887777'); // já com 9, mantém
  });

  it('mantém número já correto (DDD + 9 dígitos)', () => {
    expect(normalizeWhatsappBR('62981112677')).toBe('5562981112677');
  });

  it('remove o DDI 55 e reinsere corrigindo o 9', () => {
    expect(normalizeWhatsappBR('556281112677')).toBe('5562981112677'); // 12 díg, sem 9
    expect(normalizeWhatsappBR('5562981112677')).toBe('5562981112677'); // 13 díg, com 9
  });

  it('aceita máscara e espaços', () => {
    expect(normalizeWhatsappBR('(62) 8111-2677')).toBe('5562981112677');
    expect(normalizeWhatsappBR('+55 62 98111-2677')).toBe('5562981112677');
  });

  it('não inventa 9 em telefone fixo (local começa 2–5)', () => {
    expect(normalizeWhatsappBR('6232112677')).toBe('556232112677');
  });

  it('trata o DDD 55 sem confundir com o DDI', () => {
    // DDD 55 + celular de 9 dígitos, sem DDI → vira 55(DDI)+55(DDD)+9 díg
    expect(normalizeWhatsappBR('55981112677')).toBe('5555981112677');
  });

  it('retorna undefined para número curto demais', () => {
    expect(normalizeWhatsappBR('12345')).toBeUndefined();
    expect(normalizeWhatsappBR('')).toBeUndefined();
  });
});
