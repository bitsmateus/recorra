import { z } from 'zod';

/**
 * Validação das variáveis de ambiente com Zod.
 * Falha rápido no boot se algo obrigatório estiver faltando.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter no mínimo 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY inválida (base64 de 32 bytes)'),

  APP_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),

  // E-mail transacional da plataforma (verificação/convite)
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Recorra <no-reply@recorra.com.br>'),

  // Google SSO (opcional)
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Servidores globais de WhatsApp não-oficial (fornecidos pela plataforma)
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  UAZAPI_API_URL: z.string().optional(),
  UAZAPI_API_KEY: z.string().optional(),

  // IA (assistente de régua e de mensagem)
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
    throw new Error('Configuração de ambiente inválida');
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
