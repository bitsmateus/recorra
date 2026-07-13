import { describe, it, expect } from 'vitest';
import { getPlan, featureEnabled } from '@/modules/platform/plans';
import { computeSaasBill, checkLimits } from '@/modules/platform/metering';
import { detectAnomalies } from '@/modules/platform/anomaly';

describe('planos e features', () => {
  it('Notificador não tem cobrança; Essencial tem', () => {
    expect(featureEnabled('NOTIFICADOR', 'cobranca')).toBe(false);
    expect(featureEnabled('ESSENCIAL', 'cobranca')).toBe(true);
  });
  it('override liga uma feature fora do plano', () => {
    expect(featureEnabled('NOTIFICADOR', 'cobranca', { cobranca: true })).toBe(true);
  });
  it('Profissional tem multi_gateway', () => {
    expect(getPlan('PROFISSIONAL').features).toContain('multi_gateway');
  });
});

describe('fatura do SaaS', () => {
  it('só a base quando dentro do incluso', () => {
    const b = computeSaasBill('ESSENCIAL', { clientes: 300, disparos: 1000 });
    expect(b.total).toBe(127);
    expect(b.disparosExcedentes).toBe(0);
  });
  it('cobra excedente de disparos', () => {
    const b = computeSaasBill('ESSENCIAL', { clientes: 300, disparos: 2000 }); // 500 excedentes × 0.10
    expect(b.disparosExcedentes).toBe(500);
    expect(b.valorExcedente).toBe(50);
    expect(b.total).toBe(177);
  });
});

describe('limites do plano', () => {
  it('detecta excesso de clientes', () => {
    const r = checkLimits('ESSENCIAL', { clientes: 600, disparos: 0 });
    expect(r.clientesOk).toBe(false);
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  it('avisa proximidade do limite (>=80%)', () => {
    const r = checkLimits('ESSENCIAL', { clientes: 450, disparos: 0 });
    expect(r.clientesOk).toBe(true);
    expect(r.avisos.some((a) => a.includes('próximo'))).toBe(true);
  });
});

describe('anomalias', () => {
  it('taxa de falha crítica', () => {
    const a = detectAnomalies({ enviados: 50, falhas: 60, filaPendente: 0, webhooksNaoProcessados: 0 });
    expect(a.some((x) => x.tipo === 'TAXA_FALHA' && x.severidade === 'critico')).toBe(true);
  });
  it('fila acumulada', () => {
    const a = detectAnomalies({ enviados: 0, falhas: 0, filaPendente: 600, webhooksNaoProcessados: 0 });
    expect(a.some((x) => x.tipo === 'FILA_ACUMULADA' && x.severidade === 'critico')).toBe(true);
  });
  it('tudo saudável = sem anomalias', () => {
    expect(detectAnomalies({ enviados: 100, falhas: 2, filaPendente: 5, webhooksNaoProcessados: 0 })).toHaveLength(0);
  });
});
