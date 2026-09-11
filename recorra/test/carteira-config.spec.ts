import { describe, expect, it } from 'vitest';
import { CARTEIRA_CONFIG_PADRAO, equipeDaFaixa, lerCarteiraConfig } from '@/modules/dunning/carteira-config';

describe('carteira-config — faixas de dias por equipe', () => {
  it('aplica os padrões quando não há config salva', () => {
    expect(lerCarteiraConfig(null)).toEqual(CARTEIRA_CONFIG_PADRAO);
    expect(lerCarteiraConfig({})).toEqual(CARTEIRA_CONFIG_PADRAO);
  });

  it('mescla só os campos salvos, preservando os demais padrões', () => {
    expect(lerCarteiraConfig({ carteira: { diasRescisao: 90 } })).toEqual({
      ...CARTEIRA_CONFIG_PADRAO,
      diasRescisao: 90,
    });
  });

  it('ignora valor salvo inválido (zero/negativo) e volta ao padrão', () => {
    expect(lerCarteiraConfig({ carteira: { equipe2DesdeDia: 0, diasSerasa: -5 } })).toEqual(CARTEIRA_CONFIG_PADRAO);
  });

  it('classifica a faixa pelo corte configurado', () => {
    const cfg = { equipe2DesdeDia: 30, diasRescisao: 77, diasSerasa: 85 };
    expect(equipeDaFaixa(5, cfg)).toBe('EQUIPE_1');
    expect(equipeDaFaixa(29, cfg)).toBe('EQUIPE_1');
    expect(equipeDaFaixa(30, cfg)).toBe('EQUIPE_2');
    expect(equipeDaFaixa(90, cfg)).toBe('EQUIPE_2');
  });
});
