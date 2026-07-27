import { describe, it, expect } from 'vitest';
import { venceuAntesDeHoje } from '@/modules/connectors/source-connector.interface';

// Carência de fim de semana: vencimento em sáb/dom só vira "vencida" depois do
// próximo dia útil (igual ao Asaas). Datas em UTC para casar com a função.
const d = (s: string) => new Date(s + 'T00:00:00Z');

describe('venceuAntesDeHoje — carência de fim de semana', () => {
  it('vencimento em dia útil: vencida no dia seguinte', () => {
    // Sexta 24/07/2026. Sábado 25 já é vencida (dia útil não empurra).
    expect(venceuAntesDeHoje(d('2026-07-24'), d('2026-07-25'))).toBe(true);
  });

  it('vence hoje (dia útil) ainda não é vencida', () => {
    expect(venceuAntesDeHoje(d('2026-07-24'), d('2026-07-24'))).toBe(false);
  });

  it('vencimento no sábado NÃO é vencida no sábado, domingo nem segunda', () => {
    const sabado = d('2026-07-25'); // sábado
    expect(venceuAntesDeHoje(sabado, d('2026-07-25'))).toBe(false); // sáb
    expect(venceuAntesDeHoje(sabado, d('2026-07-26'))).toBe(false); // dom
    expect(venceuAntesDeHoje(sabado, d('2026-07-27'))).toBe(false); // seg (dia útil efetivo)
    expect(venceuAntesDeHoje(sabado, d('2026-07-28'))).toBe(true);  // ter → vencida
  });

  it('vencimento no domingo só vence na terça', () => {
    const domingo = d('2026-07-26');
    expect(venceuAntesDeHoje(domingo, d('2026-07-27'))).toBe(false); // seg
    expect(venceuAntesDeHoje(domingo, d('2026-07-28'))).toBe(true);  // ter
  });

  it('data inválida não é vencida', () => {
    expect(venceuAntesDeHoje(new Date('nada'), d('2026-07-28'))).toBe(false);
  });
});
