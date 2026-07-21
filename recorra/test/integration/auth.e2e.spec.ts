import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';

/**
 * Teste de integração ponta a ponta (roda no CI, com Postgres).
 * É pulado automaticamente se não houver DATABASE_URL configurado.
 */
const temDb = !!process.env.DATABASE_URL;

/** Extrai o valor do cookie de refresh (recorra_rt) do header Set-Cookie. */
function rtCookie(res: request.Response): string | undefined {
  const set = res.headers['set-cookie'] as unknown as string[] | undefined;
  const raw = set?.find((c) => c.startsWith('recorra_rt='));
  return raw?.split(';')[0].slice('recorra_rt='.length) || undefined;
}

describe.skipIf(!temDb)('Auth e2e', () => {
  let app: INestApplication;
  const email = `ci_${Date.now()}@teste.com`;
  const senha = 'senhaForte123';
  let accessToken = '';
  let refreshToken = ''; // valor do JWT de refresh (extraído do cookie)
  let rtCookieHeader = ''; // "recorra_rt=<jwt>" para reenviar via Cookie

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('registra um tenant: access no body, refresh em cookie httpOnly (M11)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ empresa: 'CI Ltda', nome: 'CI Bot', email, senha });
    expect([201, 200]).toContain(res.status);
    expect(res.body.accessToken).toBeTruthy();
    // O refresh NÃO vaza no corpo — vai só no cookie httpOnly.
    expect(res.body.refreshToken).toBeUndefined();
    const set = res.headers['set-cookie'] as unknown as string[];
    const raw = set.find((c) => c.startsWith('recorra_rt='))!;
    expect(raw).toMatch(/HttpOnly/i);
    accessToken = res.body.accessToken;
    refreshToken = rtCookie(res)!;
    rtCookieHeader = `recorra_rt=${refreshToken}`;
    expect(refreshToken).toBeTruthy();
  });

  it('access token é aceito como bearer em rota protegida', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clientes')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).not.toBe(401);
  });

  it('refresh token NÃO é aceito como bearer de acesso (A2)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clientes')
      .set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('um token de acesso não pode ser trocado por sessão nova (A2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
  });

  it('refresh (via cookie) rotaciona e invalida o cookie anterior (L2)', async () => {
    const primeiro = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rtCookieHeader);
    expect(primeiro.status).toBe(201);
    expect(primeiro.body.accessToken).toBeTruthy();
    const novoRt = rtCookie(primeiro);
    expect(novoRt).toBeTruthy();
    expect(novoRt).not.toBe(refreshToken);

    // Reusar o cookie antigo (já rotacionado) deve falhar.
    const reuso = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rtCookieHeader);
    expect(reuso.status).toBe(401);

    refreshToken = novoRt!;
    rtCookieHeader = `recorra_rt=${novoRt}`;
  });

  it('faz login com as credenciais criadas', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    expect(rtCookie(res)).toBeTruthy();
  });

  it('rejeita login com senha errada', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha: 'errada' });
    expect(res.status).toBe(401);
  });
});
