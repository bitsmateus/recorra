import { describe, expect, it } from 'vitest';
import { ALERTAS_ESTEIRA_PADRAO, lerAlertasEsteira } from '@/modules/dunning/carteira-config';

describe('carteira-config — alertas da esteira (rescisão/Serasa)', () => {
  it('aplica os padrões quando não há config salva', () => {
    expect(lerAlertasEsteira(null)).toEqual(ALERTAS_ESTEIRA_PADRAO);
    expect(lerAlertasEsteira({})).toEqual(ALERTAS_ESTEIRA_PADRAO);
  });

  it('mescla só os campos salvos, preservando os demais padrões', () => {
    expect(lerAlertasEsteira({ alertasEsteira: { diasRescisao: 90 } })).toEqual({
      ...ALERTAS_ESTEIRA_PADRAO,
      diasRescisao: 90,
    });
  });

  it('ignora valor salvo inválido (zero/negativo) e volta ao padrão', () => {
    expect(lerAlertasEsteira({ alertasEsteira: { diasRescisao: 0, diasSerasa: -5 } })).toEqual(ALERTAS_ESTEIRA_PADRAO);
  });
});
