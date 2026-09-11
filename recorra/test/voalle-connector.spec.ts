import { describe, expect, it } from 'vitest';
import { statusContratoDoPerson } from '@/modules/connectors/providers/voalle.connector';

/**
 * A Voalle não documenta publicamente um campo fixo de status de contrato no
 * payload de pessoas — este teste trava só o comportamento de melhor esforço
 * (candidatos de campo + normalização), não a exatidão do campo real da API.
 * Validar com uma sincronização real antes de confiar no valor em produção.
 */
describe('Voalle — statusContratoDoPerson (melhor esforço)', () => {
  it('lê contractStatus quando presente', () => {
    expect(statusContratoDoPerson({ contractStatus: 'Ativo' })).toBe('Ativo');
  });

  it('cai para contract.status quando contractStatus não existe', () => {
    expect(statusContratoDoPerson({ contract: { status: 'Cancelado' } })).toBe('Cancelado');
  });

  it('cai para situacao/status soltos como último recurso', () => {
    expect(statusContratoDoPerson({ situacao: 'Suspenso' })).toBe('Suspenso');
    expect(statusContratoDoPerson({ status: 'Inativo' })).toBe('Inativo');
  });

  it('retorna undefined quando nenhum campo existe', () => {
    expect(statusContratoDoPerson({ name: 'Fulano' })).toBeUndefined();
  });

  it('descarta string vazia/whitespace', () => {
    expect(statusContratoDoPerson({ status: '   ' })).toBeUndefined();
  });
});
