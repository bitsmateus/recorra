import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM puro, parametrizado pela chave — usado pelo CryptoService e pelo
 * script de rotação de chave (prisma/rotate-encryption-key.ts).
 *
 * Formato: base64(iv).base64(authTag).base64(ciphertext)
 * A chave AES (32 bytes) é derivada por sha256 da string informada.
 */

function deriveKey(keyString: string): Buffer {
  return createHash('sha256').update(keyString).digest();
}

export function encryptWith(keyString: string, plain: string): string {
  const key = deriveKey(keyString);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptWith(keyString: string, payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado inválido');
  const key = deriveKey(keyString);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
