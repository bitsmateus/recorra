import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Intercepta o resolvedor do SO para testar a política do safeLookup sem rede.
const lookupMock = vi.fn();
vi.mock('node:dns', () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

const { safeLookup, isPrivateIp } = await import('@/common/net/safe-http');

/** Chama o safeLookup e devolve (err, address, family) numa promise. */
function resolver(host: string, options: unknown): Promise<{ err: any; address: any; family: any }> {
  return new Promise((res) => {
    safeLookup(host, options, (err: unknown, address: unknown, family: unknown) => res({ err, address, family } as any));
  });
}

/** Simula o dns.lookup do Node devolvendo a lista dada (sempre com all: true). */
function comEnderecos(lista: { address: string; family: number }[]) {
  lookupMock.mockImplementation((_host: string, _opts: unknown, cb: any) => cb(null, lista));
}

beforeEach(() => lookupMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('safeLookup', () => {
  it('prefere IPv4 quando o host publica A e AAAA (container sem rota IPv6)', async () => {
    comEnderecos([
      { address: '2804:7438:2:c1::37:4', family: 6 },
      { address: '177.52.37.4', family: 4 },
    ]);
    const { err, address, family } = await resolver('erp.exemplo.com.br', {});
    expect(err).toBeNull();
    expect(address).toBe('177.52.37.4');
    expect(family).toBe(4);
  });

  it('usa IPv6 quando é o único disponível', async () => {
    comEnderecos([{ address: '2804:7438:2:c1::37:4', family: 6 }]);
    const { err, address, family } = await resolver('erp.exemplo.com.br', {});
    expect(err).toBeNull();
    expect(address).toBe('2804:7438:2:c1::37:4');
    expect(family).toBe(6);
  });

  it('com all: true devolve a lista inteira, IPv4 primeiro', async () => {
    comEnderecos([
      { address: '2804:7438:2:c1::37:4', family: 6 },
      { address: '177.52.37.4', family: 4 },
    ]);
    const { err, address } = await resolver('erp.exemplo.com.br', { all: true });
    expect(err).toBeNull();
    expect(address).toEqual([
      { address: '177.52.37.4', family: 4 },
      { address: '2804:7438:2:c1::37:4', family: 6 },
    ]);
  });

  it('bloqueia se QUALQUER endereço resolvido for interno (anti-rebinding)', async () => {
    comEnderecos([
      { address: '177.52.37.4', family: 4 },
      { address: '169.254.169.254', family: 4 }, // metadata de cloud
    ]);
    const { err } = await resolver('malicioso.exemplo', {});
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toContain('SSRF bloqueado');
  });

  it('erro claro quando o DNS não devolve endereço', async () => {
    comEnderecos([]);
    const { err } = await resolver('vazio.exemplo', {});
    expect(String(err.message)).toContain('não retornou endereço');
  });

  it('propaga a falha do resolvedor do SO', async () => {
    lookupMock.mockImplementation((_h: string, _o: unknown, cb: any) => cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })));
    const { err } = await resolver('inexistente.exemplo', {});
    expect(err.code).toBe('ENOTFOUND');
  });
});

describe('isPrivateIp — IPv6 público do SGP não é bloqueado', () => {
  it('endereço global 2804:: é público', () => {
    expect(isPrivateIp('2804:7438:2:c1::37:4')).toBe(false);
  });
  it('ULA e link-local são internos', () => {
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });
});
