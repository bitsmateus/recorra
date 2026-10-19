import { describe, expect, it } from 'vitest';
import { erroPassoWebhook, renderWebhookBody, valorNumero } from '../src/modules/dunning/webhook-step';

const CORPO = '{"nome":"{{nomeCompleto}}","placa":"{{placa}}","valor":"{{valorNumero}}","vencimento":"{{vencimento}}","cobrancaId":"{{idExterno}}","documento":"{{cpf}}"}';

describe('passo webhook', () => {
  it('formata o valor como 391,30 (sem moeda e sem milhar)', () => {
    expect(valorNumero(391.3)).toBe('391,30');
    expect(valorNumero(1250)).toBe('1250,00');
  });

  it('monta o corpo com todos os campos; placa ausente vira string vazia', () => {
    const corpo = JSON.parse(renderWebhookBody(CORPO, {
      nomeCompleto: 'Maria da Silva', placa: '', valorNumero: '391,30', vencimento: '16/10/2026', idExterno: 'pay_abc123', cpf: '12345678909',
    }));
    expect(corpo).toEqual({ nome: 'Maria da Silva', placa: '', valor: '391,30', vencimento: '16/10/2026', cobrancaId: 'pay_abc123', documento: '12345678909' });
  });

  it('aspas e barras no nome não quebram o JSON', () => {
    const corpo = JSON.parse(renderWebhookBody('{"nome":"{{nomeCompleto}}"}', { nomeCompleto: 'João "Zé" \\ Souza' }));
    expect(corpo.nome).toBe('João "Zé" \\ Souza');
  });

  it('valida URL e JSON ao salvar', () => {
    expect(erroPassoWebhook('https://n8n.exemplo.com/webhook/x', CORPO)).toBeNull();
    expect(erroPassoWebhook('', CORPO)).toMatch(/URL/);
    expect(erroPassoWebhook('ftp://x', CORPO)).toMatch(/URL/);
    expect(erroPassoWebhook('https://x.com', '{nome: 1')).toMatch(/JSON/);
    expect(erroPassoWebhook('https://x.com', '[]')).toMatch(/objeto/);
  });
});

describe('varsDoWebhook', () => {
  it('usa o id do gateway; sem ele, o do ERP; placa ausente vira vazio', async () => {
    const { varsDoWebhook } = await import('../src/modules/dunning/webhook-step');
    const base = { valor: 391.3, vencimento: new Date('2026-10-16T00:00:00Z'), customer: { nome: 'Maria Souza', doc: '123', contrato: null } };
    expect(varsDoWebhook({ ...base, externalId: 'pay_1', sourceExternalId: 'erp9' }).idExterno).toBe('pay_1');
    expect(varsDoWebhook({ ...base, externalId: null, sourceExternalId: 'erp9' }).idExterno).toBe('erp9');
    const v = varsDoWebhook(base);
    expect(v).toMatchObject({ placa: '', valorNumero: '391,30', vencimento: '16/10/2026', nomeCompleto: 'Maria Souza' });
  });
});
