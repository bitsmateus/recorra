import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '@/config/env';

/**
 * Criptografia AES-256-GCM para credenciais de terceiros (gateways, canais, ERPs)
 * guardadas no banco. NUNCA armazenar segredos de tenants em texto puro.
 *
 * Formato de saída: base64(iv).base64(authTag).base64(ciphertext)
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    // Deriva uma chave de 32 bytes a partir da ENCRYPTION_KEY (aceita base64 ou texto).
    this.key = createHash('sha256').update(env.ENCRYPTION_KEY).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
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
