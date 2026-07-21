import { describe, it, expect } from 'vitest';
import { proximaExecucao, motivoExclusaoPublico } from '@/modules/campaigns/campaigns.service';
import { venceuAntesDeHoje } from '@/modules/connectors/source-connector.interface';

describe('proximaExecucao (recorrência de campanha)', () => {
  it('UMA_VEZ não recorre', () => {
    expect(proximaExecucao('UMA_VEZ', null, new Date('2026-07-21T12:00:00Z'))).toBeNull();
  });

  it('SEMPRE_ATIVA reavalia no dia seguinte (não no próximo mês)', () => {
    const now = new Date('2026-07-21T12:00:00Z');
    const prox = proximaExecucao('SEMPRE_ATIVA', null, now)!;
    expect(prox.getTime() - now.getTime()).toBe(24 * 3600 * 1000);
  });

  it('MENSAL: dia ainda por vir neste mês', () => {
    const prox = proximaExecucao('MENSAL', 10, new Date(2026, 0, 5, 8, 0, 0))!; // 05/jan
    expect(prox.getMonth()).toBe(0); // janeiro
    expect(prox.getDate()).toBe(10);
  });

  it('MENSAL: dia já passou → próximo mês', () => {
    const prox = proximaExecucao('MENSAL', 10, new Date(2026, 0, 15, 8, 0, 0))!; // 15/jan
    expect(prox.getMonth()).toBe(1); // fevereiro
    expect(prox.getDate()).toBe(10);
  });
});

describe('venceuAntesDeHoje (borda de vencimento do ERP)', () => {
  const hojeUtc = () => { const h = new Date(); return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate())); };

  it('vence HOJE ainda é pendente (não vencida)', () => {
    expect(venceuAntesDeHoje(hojeUtc())).toBe(false);
  });

  it('venceu ontem → vencida', () => {
    const ontem = new Date(hojeUtc().getTime() - 86400000);
    expect(venceuAntesDeHoje(ontem)).toBe(true);
  });

  it('vence amanhã → pendente', () => {
    const amanha = new Date(hojeUtc().getTime() + 86400000);
    expect(venceuAntesDeHoje(amanha)).toBe(false);
  });

  it('data inválida não é classificada como vencida (evita marcar tudo)', () => {
    expect(venceuAntesDeHoje(new Date('lixo'))).toBe(false);
  });
});

describe('motivoExclusaoPublico (opt-out/alcance por conjunto de canais)', () => {
  const base = { telefone: '5511999999999', email: 'x@x.com', temFaturaAberta: true, isLembrete: false, optOut: new Set<any>() };

  it('participa quando alcançável e sem opt-out', () => {
    expect(motivoExclusaoPublico({ ...base, canais: ['WHATSAPP_CLOUD'] })).toBeNull();
  });

  it('LGPD: opt-out no único canal → excluído', () => {
    expect(motivoExclusaoPublico({ ...base, canais: ['EMAIL'], optOut: new Set(['EMAIL']) })).toMatch(/Opt-out/);
  });

  it('LGPD: régua WhatsApp+Email, opt-out só no WhatsApp → ainda participa (via e-mail)', () => {
    expect(motivoExclusaoPublico({ ...base, canais: ['WHATSAPP_CLOUD', 'EMAIL'], optOut: new Set(['WHATSAPP_CLOUD']) })).toBeNull();
  });

  it('não bloqueia por falta de telefone se recebe por e-mail', () => {
    expect(motivoExclusaoPublico({ ...base, telefone: null, canais: ['WHATSAPP_CLOUD', 'EMAIL'] })).toBeNull();
  });

  it('sem telefone e canal único WhatsApp → excluído', () => {
    expect(motivoExclusaoPublico({ ...base, telefone: null, canais: ['WHATSAPP_CLOUD'] })).toMatch(/telefone/);
  });

  it('sem e-mail e canal único Email → excluído', () => {
    expect(motivoExclusaoPublico({ ...base, email: null, canais: ['EMAIL'] })).toMatch(/e-mail/);
  });

  it('lembrete sem fatura em aberto → excluído', () => {
    expect(motivoExclusaoPublico({ ...base, canais: ['WHATSAPP_CLOUD'], isLembrete: true, temFaturaAberta: false })).toMatch(/fatura/);
  });

  it('opt-out em todos os canais alcançáveis → excluído', () => {
    expect(motivoExclusaoPublico({ ...base, canais: ['WHATSAPP_CLOUD', 'EMAIL'], optOut: new Set(['WHATSAPP_CLOUD', 'EMAIL']) })).toMatch(/Opt-out/);
  });
});
