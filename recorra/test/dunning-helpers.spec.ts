import { describe, it, expect } from 'vitest';
import { isWithinWindow, nextAllowedSlot, withinDailyLimit } from '@/modules/dunning/windows';
import { channelChain, nextChannel } from '@/modules/dunning/fallback';
import { chooseChannel } from '@/modules/dunning/routing';
import { pickVariant, evaluateAb } from '@/modules/dunning/abtest';

const cfg = { inicioHora: 9, fimHora: 20, diasUteisSomente: true };

describe('janela de envio', () => {
  it('dentro do horário comercial em dia útil', () => {
    expect(isWithinWindow(10, 2, cfg)).toBe(true);
  });
  it('fora do horário', () => {
    expect(isWithinWindow(21, 2, cfg)).toBe(false);
    expect(isWithinWindow(7, 2, cfg)).toBe(false);
  });
  it('bloqueia fim de semana quando só dias úteis', () => {
    expect(isWithinWindow(10, 6, cfg)).toBe(false); // sábado
    expect(isWithinWindow(10, 0, cfg)).toBe(false); // domingo
  });
  it('nextAllowedSlot: antes do início vai para o início do mesmo dia', () => {
    expect(nextAllowedSlot(7, 2, cfg)).toEqual({ addDias: 0, hora: 9 });
  });
  it('nextAllowedSlot: sábado de manhã vai para segunda', () => {
    expect(nextAllowedSlot(10, 6, cfg)).toEqual({ addDias: 2, hora: 9 });
  });
  it('withinDailyLimit respeita o teto', () => {
    expect(withinDailyLimit(3, 5)).toBe(true);
    expect(withinDailyLimit(5, 5)).toBe(false);
    expect(withinDailyLimit(100, null)).toBe(true);
  });
});

describe('fallback multicanal', () => {
  it('monta a cadeia sem duplicar', () => {
    expect(channelChain('WHATSAPP_CLOUD', ['SMS', 'WHATSAPP_CLOUD', 'EMAIL'])).toEqual(['WHATSAPP_CLOUD', 'SMS', 'EMAIL']);
  });
  it('pega o próximo não tentado', () => {
    const chain = ['WHATSAPP_CLOUD', 'SMS', 'EMAIL'];
    expect(nextChannel(chain, ['WHATSAPP_CLOUD'])).toBe('SMS');
    expect(nextChannel(chain, ['WHATSAPP_CLOUD', 'SMS', 'EMAIL'])).toBeNull();
  });
});

describe('roteamento por custo', () => {
  it('prefere canal grátis', () => {
    const c = chooseChannel([
      { canal: 'SMS', custo: 0.12, disponivel: true },
      { canal: 'WHATSAPP_CLOUD', custo: 0.1, disponivel: true, gratisAgora: true },
    ]);
    expect(c).toBe('WHATSAPP_CLOUD');
  });
  it('sem grátis, pega o mais barato disponível', () => {
    const c = chooseChannel([
      { canal: 'SMS', custo: 0.12, disponivel: true },
      { canal: 'WHATSAPP_CLOUD', custo: 0.1, disponivel: true },
      { canal: 'EMAIL', custo: 0.001, disponivel: false },
    ]);
    expect(c).toBe('WHATSAPP_CLOUD');
  });
  it('null quando nada disponível', () => {
    expect(chooseChannel([{ canal: 'SMS', custo: 0.1, disponivel: false }])).toBeNull();
  });
});

describe('A/B testing', () => {
  it('pickVariant é determinístico', () => {
    const v = pickVariant('cliente1:step1');
    expect(v).toBe(pickVariant('cliente1:step1'));
    expect(['A', 'B']).toContain(v);
  });
  it('aponta a vencedora com amostra suficiente', () => {
    const { vencedora } = evaluateAb([
      { variante: 'A', enviados: 100, pagos: 30 },
      { variante: 'B', enviados: 100, pagos: 20 },
    ]);
    expect(vencedora).toBe('A');
  });
  it('não decide com amostra pequena', () => {
    const { vencedora } = evaluateAb([
      { variante: 'A', enviados: 5, pagos: 3 },
      { variante: 'B', enviados: 4, pagos: 1 },
    ]);
    expect(vencedora).toBeNull();
  });
});
