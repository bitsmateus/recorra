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

describe.skipIf(!temDb)('Auth e2e', () => {
  let app: INestApplication;
  const email = `ci_${Date.now()}@teste.com`;
  const senha = 'senhaForte123';

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

  it('registra um novo tenant e retorna tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ empresa: 'CI Ltda', nome: 'CI Bot', email, senha });
    expect([201, 200]).toContain(res.status);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('faz login com as credenciais criadas', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejeita login com senha errada', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha: 'errada' });
    expect(res.status).toBe(401);
  });
});
