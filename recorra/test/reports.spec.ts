import { describe, it, expect } from 'vitest';
import { funnelByChannel, funnelByStep } from '@/modules/reports/funnel';
import { custoComunicacao, computeRoi } from '@/modules/reports/roi';
import { toCsv } from '@/modules/reports/csv';

describe('funil de recuperação', () => {
  const rows = [
    { canal: 'WHATSAPP_CLOUD', offsetDias: -3, enviado: true, pago: true },
    { canal: 'WHATSAPP_CLOUD', offsetDias: 0, enviado: true, pago: false },
    { canal: 'EMAIL', offsetDias: 3, enviado: true, pago: true },
    { canal: 'EMAIL', offsetDias: 3, enviado: false, pago: false }, // não enviado: ignorado
  ];
  it('agrega por canal com taxa', () => {
    const f = funnelByChannel(rows);
    const wa = f.find((x) => x.chave === 'WHATSAPP_CLOUD')!;
    expect(wa.enviados).toBe(2);
    expect(wa.pagos).toBe(1);
    expect(wa.taxa).toBe(0.5);
  });
  it('agrega por passo (offset) ordenado', () => {
    const f = funnelByStep(rows);
    expect(f.map((x) => x.chave)).toEqual(['-3', '0', '3']);
  });
});

describe('custo e ROI', () => {
  it('soma o custo por canal', () => {
    const c = custoComunicacao([
      { canal: 'WHATSAPP_CLOUD', quantidade: 100 }, // 10.00
      { canal: 'SMS', quantidade: 50 }, // 6.00
      { canal: 'EMAIL', quantidade: 1000 }, // 1.00
    ]);
    expect(c).toBe(17);
  });
  it('calcula ROI e retorno por real', () => {
    const r = computeRoi(17, 3100);
    expect(r.lucro).toBe(3083);
    expect(r.retornoPorReal).toBe(182.35);
  });
  it('ROI zero quando custo é zero', () => {
    expect(computeRoi(0, 100).roi).toBe(0);
  });
});

describe('export CSV', () => {
  it('gera CSV com escaping', () => {
    const csv = toCsv(
      [{ key: 'nome', label: 'Nome' }, { key: 'valor', label: 'Valor' }],
      [{ nome: 'João, Silva', valor: 99.9 }, { nome: 'Maria', valor: 10 }],
    );
    expect(csv).toBe('Nome,Valor\n"João, Silva",99.9\nMaria,10');
  });
});
