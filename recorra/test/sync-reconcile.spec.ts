import { describe, it, expect } from 'vitest';
import { faturasQuitadasPorAusencia, FaturaLocal } from '@/modules/connectors/sync-reconcile';

const f = (id: string, ext: string | null, status: FaturaLocal['status']): FaturaLocal => ({ id, sourceExternalId: ext, status });

describe('faturasQuitadasPorAusencia', () => {
  it('quita as que sumiram da lista de abertas do ERP', () => {
    const locais = [f('a', 'E1', 'PENDENTE'), f('b', 'E2', 'VENCIDA'), f('c', 'E3', 'PENDENTE')];
    const presentes = new Set(['E1', 'E3']); // E2 sumiu → pago
    expect(faturasQuitadasPorAusencia(locais, presentes, true)).toEqual(['b']);
  });

  it('nunca mexe em PAGA/CANCELADA/ESTORNADA', () => {
    const locais = [f('a', 'E1', 'PAGA'), f('b', 'E2', 'CANCELADA'), f('c', 'E3', 'ESTORNADA')];
    expect(faturasQuitadasPorAusencia(locais, new Set(), true)).toEqual([]);
  });

  it('trava de segurança: fetch vazio não quita nada', () => {
    const locais = [f('a', 'E1', 'PENDENTE'), f('b', 'E2', 'VENCIDA')];
    // Mesmo com todas ausentes, se o fetch não trouxe nada (erro/vazio) → [].
    expect(faturasQuitadasPorAusencia(locais, new Set(), false)).toEqual([]);
  });

  it('ignora faturas sem sourceExternalId (não vieram do ERP)', () => {
    const locais = [f('a', null, 'PENDENTE'), f('b', 'E2', 'VENCIDA')];
    const presentes = new Set(['E9']); // nenhuma das duas está presente
    // 'a' não tem externalId (fatura manual) → não é candidata; só 'b' quita.
    expect(faturasQuitadasPorAusencia(locais, presentes, true)).toEqual(['b']);
  });

  it('não quita quem continua na lista de abertas', () => {
    const locais = [f('a', 'E1', 'PENDENTE'), f('b', 'E2', 'VENCIDA')];
    const presentes = new Set(['E1', 'E2']);
    expect(faturasQuitadasPorAusencia(locais, presentes, true)).toEqual([]);
  });
});
