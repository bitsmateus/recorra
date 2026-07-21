import { describe, it, expect, beforeAll } from 'vitest';

// env dummy só para o import de @/config/env (usado por refresh-cookie) passar.
process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/db';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.ENCRYPTION_KEY ||= 'y'.repeat(40);

/**
 * M11 — mecânica do refresh em cookie httpOnly. Instancia o AuthController real
 * com o AuthService mockado (o DI do Nest não roda sob esbuild/vitest, então
 * injetamos na mão) e exercita os helpers reais de cookie via res/req falsos.
 * Sem Postgres/Redis.
 */
type CookieCall = { name: string; val: string; opts: Record<string, unknown> };

function fakeRes() {
  const set: CookieCall[] = [];
  const cleared: { name: string; opts: Record<string, unknown> }[] = [];
  return {
    cookie: (name: string, val: string, opts: Record<string, unknown>) => set.push({ name, val, opts }),
    clearCookie: (name: string, opts: Record<string, unknown>) => cleared.push({ name, opts }),
    _set: set,
    _cleared: cleared,
  };
}

describe('M11 — refresh token em cookie httpOnly (AuthController + helpers reais)', () => {
  let ctrl: any;
  const recebido: { refresh?: string; logout?: string } = {};

  beforeAll(async () => {
    const { AuthController } = await import('@/modules/auth/auth.controller');
    const authMock = {
      login: async () => ({ accessToken: 'ACC', refreshToken: 'REF' }),
      register: async () => ({ accessToken: 'ACC', refreshToken: 'REF', emailVerify: false }),
      loginGoogle: async () => ({ accessToken: 'ACC', refreshToken: 'REF' }),
      refresh: async (t: string) => { recebido.refresh = t; return { accessToken: 'ACC2', refreshToken: 'REF2' }; },
      logout: async (t: string) => { recebido.logout = t; return { ok: true }; },
    };
    ctrl = new (AuthController as any)(authMock);
  });

  it('login: access no body, refresh só no cookie httpOnly (não vaza no corpo)', async () => {
    const res = fakeRes();
    const body = await ctrl.login({ email: 'a@b.com', senha: 'x' }, res);
    expect(body.accessToken).toBe('ACC');
    expect(body.refreshToken).toBeUndefined();
    expect(res._set).toHaveLength(1);
    const c = res._set[0];
    expect(c.name).toBe('recorra_rt');
    expect(c.val).toBe('REF');
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth' });
    expect(c.opts.secure).toBe(false); // NODE_ENV=test → sem Secure (dev http)
    expect(c.opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('register: refresh no cookie, corpo sem refreshToken', async () => {
    const res = fakeRes();
    const body = await ctrl.register({ empresa: 'X', nome: 'Y', email: 'a@b.com', senha: 'x' }, res);
    expect(body.refreshToken).toBeUndefined();
    expect(body.emailVerify).toBe(false);
    expect(res._set[0]).toMatchObject({ name: 'recorra_rt', opts: { httpOnly: true } });
  });

  it('google: refresh no cookie, corpo sem refreshToken', async () => {
    const res = fakeRes();
    const body = await ctrl.google('idtoken', res, undefined);
    expect(body.refreshToken).toBeUndefined();
    expect(body.accessToken).toBe('ACC');
    expect(res._set[0].name).toBe('recorra_rt');
  });

  it('refresh: lê do COOKIE, rotaciona (novo cookie) e não devolve refresh no corpo', async () => {
    const res = fakeRes();
    const req = { headers: { cookie: 'foo=1; recorra_rt=DO_COOKIE; bar=2' } };
    const body = await ctrl.refresh(req, res, undefined);
    expect(recebido.refresh).toBe('DO_COOKIE'); // usou o cookie
    expect(body.accessToken).toBe('ACC2');
    expect(body.refreshToken).toBeUndefined();
    expect(res._set[0]).toMatchObject({ name: 'recorra_rt', val: 'REF2' });
  });

  it('refresh: fallback para o body quando não há cookie (transição sem quebra)', async () => {
    const res = fakeRes();
    const body = await ctrl.refresh({ headers: {} }, res, 'DO_BODY');
    expect(recebido.refresh).toBe('DO_BODY');
    expect(body.accessToken).toBe('ACC2');
  });

  it('refresh: cookie tem precedência sobre o body', async () => {
    const res = fakeRes();
    await ctrl.refresh({ headers: { cookie: 'recorra_rt=DO_COOKIE' } }, res, 'DO_BODY');
    expect(recebido.refresh).toBe('DO_COOKIE');
  });

  it('logout: revoga o token do cookie e limpa o cookie', async () => {
    const res = fakeRes();
    const out = await ctrl.logout({ headers: { cookie: 'recorra_rt=DO_COOKIE' } }, res, undefined);
    expect(out).toEqual({ ok: true });
    expect(recebido.logout).toBe('DO_COOKIE');
    expect(res._cleared[0]).toMatchObject({ name: 'recorra_rt', opts: { path: '/api/auth' } });
  });
});
