import { describe, it, expect } from 'vitest';
import { zonedSlotToUtc, nextAllowedSlot } from '@/modules/dunning/windows';

describe('zonedSlotToUtc — janela no fuso do tenant, não do servidor', () => {
  const SP = 'America/Sao_Paulo'; // UTC-3, sem horário de verão atualmente

  it('09:00 no mesmo dia (SP) vira 12:00 UTC', () => {
    // base: 2026-07-20T09:00Z = 06:00 em SP (dia 20)
    const base = new Date('2026-07-20T09:00:00Z');
    expect(zonedSlotToUtc(base, SP, 0, 9).toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });

  it('09:00 do dia seguinte (SP) a partir da noite anterior', () => {
    // base: 2026-07-20T23:00Z = 20:00 em SP (dia 20) → alvo 21/07 09:00 SP = 12:00Z
    const base = new Date('2026-07-20T23:00:00Z');
    expect(zonedSlotToUtc(base, SP, 1, 9).toISOString()).toBe('2026-07-21T12:00:00.000Z');
  });

  it('vira o mês corretamente (31/07 → 01/08 em SP)', () => {
    const base = new Date('2026-07-31T23:00:00Z'); // 20:00 SP, dia 31
    expect(zonedSlotToUtc(base, SP, 1, 9).toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('em UTC o slot bate com a hora UTC', () => {
    const base = new Date('2026-07-20T22:00:00Z');
    expect(zonedSlotToUtc(base, 'UTC', 0, 9).toISOString()).toBe('2026-07-20T09:00:00.000Z');
  });

  it('regressão do bug: às 22:00 SP, o próximo slot 09:00 NÃO cai às 06:00 SP', () => {
    // Cenário do relatório: janela 9–20, servidor UTC. Antes, setHours(9) no
    // servidor gerava 09:00Z = 06:00 SP (fora da janela). Agora deve ser 12:00Z.
    const base = new Date('2026-07-21T01:00:00Z'); // 22:00 SP do dia 20
    const cfg = { inicioHora: 9, fimHora: 20, diasUteisSomente: false };
    const slot = nextAllowedSlot(22, 1, cfg); // 22h, segunda → { addDias:1, hora:9 }
    const instante = zonedSlotToUtc(base, SP, slot.addDias, slot.hora);
    expect(instante.toISOString()).toBe('2026-07-21T12:00:00.000Z'); // 09:00 SP, dentro da janela
  });
});
