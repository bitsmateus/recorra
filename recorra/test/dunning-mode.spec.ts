import { describe, expect, it } from 'vitest';
import { selecionarRegua } from '@/modules/dunning/dunning.service';
import { SetRiskModeDto } from '@/modules/dunning/dto/rule.dto';
import { validate } from 'class-validator';

const regras = [
  { id: 'todas', faixaRisco: null, ativo: true },
  { id: 'bom', faixaRisco: 'BOM', ativo: true },
  { id: 'risco', faixaRisco: 'RISCO', ativo: true },
  { id: 'inativa', faixaRisco: 'ATENCAO', ativo: false },
];

describe('selecionarRegua', () => {
  it('modo simples respeita a régua padrão explícita', () => {
    expect(selecionarRegua(regras, false, null, 'risco')?.id).toBe('risco');
  });

  it('modo simples ignora padrão inativo e cai em Todas as faixas', () => {
    expect(selecionarRegua(regras, false, null, 'inativa')?.id).toBe('todas');
  });

  it('modo simples usa a primeira ativa quando não existe Todas', () => {
    expect(selecionarRegua(regras.slice(1), false, null, null)?.id).toBe('bom');
  });

  it('modo por faixa dá prioridade à régua específica', () => {
    expect(selecionarRegua(regras, true, 'BOM')?.id).toBe('bom');
  });

  it('modo por faixa usa Todas quando não existe específica ativa', () => {
    expect(selecionarRegua(regras, true, 'ATENCAO')?.id).toBe('todas');
  });

  it('retorna vazio quando nenhuma régua pode atender', () => {
    expect(selecionarRegua([{ id: 'x', faixaRisco: 'BOM', ativo: false }], true, 'BOM')).toBeNull();
  });
});

describe('SetRiskModeDto', () => {
  it('rejeita string "false" para não convertê-la acidentalmente em true', async () => {
    const dto = Object.assign(new SetRiskModeDto(), { usarFaixaRisco: 'false' });
    expect(await validate(dto)).toHaveLength(1);
  });

  it('aceita booleano real', async () => {
    const dto = Object.assign(new SetRiskModeDto(), { usarFaixaRisco: false });
    expect(await validate(dto)).toHaveLength(0);
  });
});
