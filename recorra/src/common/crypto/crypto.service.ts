import { Injectable } from '@nestjs/common';
import { env } from '@/config/env';
import { encryptWith, decryptWith } from './aes';

/**
 * Criptografia AES-256-GCM para credenciais de terceiros (gateways, canais, ERPs)
 * guardadas no banco. NUNCA armazenar segredos de tenants em texto puro.
 *
 * Rotação de chave sem downtime: cifra sempre com `ENCRYPTION_KEY` (nova);
 * ao decifrar, tenta a nova e, se falhar, tenta `ENCRYPTION_KEY_OLD` (antiga).
 * Depois de rodar prisma/rotate-encryption-key.ts, remova a ENCRYPTION_KEY_OLD.
 */
@Injectable()
export class CryptoService {
  encrypt(plain: string): string {
    return encryptWith(env.ENCRYPTION_KEY, plain);
  }

  decrypt(payload: string): string {
    try {
      return decryptWith(env.ENCRYPTION_KEY, payload);
    } catch (e) {
      if (env.ENCRYPTION_KEY_OLD) return decryptWith(env.ENCRYPTION_KEY_OLD, payload);
      throw e;
    }
  }

  /** Cifra um objeto JSON (credenciais). */
  encryptJson(obj: unknown): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /** Decifra para objeto JSON. */
  decryptJson<T = Record<string, unknown>>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }
}
