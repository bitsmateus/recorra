import { describe, it, expect } from 'vitest';
import { canTransition } from '@/modules/payments/invoice-status';

describe('canTransition (máquina de estados da fatura)', () => {
  it('permite transições válidas', () => {
    expect(canTransition('PENDENTE', 'PAGA')).toBe(true);
    expect(canTransition('VENCIDA', 'PAGA')).toBe(true);
    expect(canTransition('PENDENTE', 'CANCELADA')).toBe(true);
    expect(canTransition('PAGA', 'ESTORNADA')).toBe(true);
    expect(canTransition('PAGA', 'PAGA')).toBe(true); // no-op
  });

  it('bloqueia transições ilegais', () => {
    expect(canTransition('CANCELADA', 'PAGA')).toBe(false);
    expect(canTransition('PAGA', 'PENDENTE')).toBe(false);
    expect(canTransition('ESTORNADA', 'PAGA')).toBe(false);
    expect(canTransition('CANCELADA', 'PENDENTE')).toBe(false);
  });
});
