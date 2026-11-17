import { describe, it, expect } from 'vitest';
import { tituloParaFatura, dataPagamento, urlComPorta, statusDoTitulo } from '@/modules/connectors/providers/voalle.connector';

// Formato da coleção oficial "API's para Terceiros - ERPVoalle" (gettitlesbytxid / getopentitlesbyexpirationdate).
const titulo = (over: any = {}) => ({
  id: 123456,
  contractNumber: '10321',
  billet: {
    title: 'FAT000000000000000', expirationDate: '2026-11-10', status: 'Em aberto',
    amount: { value: 99.9, finalValue: 104.5, originalValue: 99.9 },
    typefulLine: '00000.00000 00000.000000 00000.00000 0 000000000000', pixQRCode: '000201br.gov.bcb.pix',
    receipts: [],
  },
  client: { txId: '123.456.789-00', name: 'Fulano' },
  ...over,
});

describe('Voalle — mapeamento dos títulos', () => {
  it('título em aberto vencido vira fatura VENCIDA com cliente pelo CPF', () => {
    const f = tituloParaFatura(titulo())!;
    expect(f.externalId).toBe('123456');
    expect(f.customerDoc).toBe('12345678900');
    expect(f.contrato).toBe('10321');
    expect(f.valor).toBe(104.5);
    expect(f.status).toBe('VENCIDA');
    expect(f.pixCopiaCola).toBe('000201br.gov.bcb.pix');
  });
  it('status "Paga" traz a data do recebimento (receipts como objeto)', () => {
    const f = tituloParaFatura(titulo({ billet: { ...titulo().billet, status: 'Paga', receipts: { ammount: 99.9, receiptDate: '2026-11-12' } } }))!;
    expect(f.status).toBe('PAGA');
    expect(f.pagoEm?.toISOString().slice(0, 10)).toBe('2026-11-12');
  });
  it('receipts como lista usa o recebimento mais recente', () => {
    const d = dataPagamento({ billet: { receipts: [{ receiptDate: '2026-11-01' }, { receiptDate: '2026-11-05' }] } });
    expect(d?.toISOString().slice(0, 10)).toBe('2026-11-05');
  });
  it('Cancelada e título sem vencimento', () => {
    expect(statusDoTitulo('Cancelada', new Date('2026-01-01'))).toBe('CANCELADA');
    expect(tituloParaFatura({ id: 1, billet: {} })).toBeNull();
  });
  it('troca a porta do endereço-base', () => {
    expect(urlComPorta('erp.exemplo.com.br', 45700)).toBe('https://erp.exemplo.com.br:45700');
    expect(urlComPorta('https://erp.exemplo.com.br:8080/', 45715)).toBe('https://erp.exemplo.com.br:45715');
  });
});
