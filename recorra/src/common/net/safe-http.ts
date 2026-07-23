import { lookup as dnsLookup } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';

/**
 * Proteção contra SSRF para requisições com URL controlada pelo tenant
 * (conectores ERP, canais Evolution/uazapi/HTTP-genérico/NX).
 *
 * Instala um `lookup` de DNS que valida o IP REALMENTE resolvido e recusa
 * destinos internos (privados/loopback/link-local/metadata de cloud). Como a
 * validação é no momento da conexão, também barra DNS-rebinding.
 */

/** True se o IP for interno (não deve ser alcançável a partir do servidor). */
export function isPrivateIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  // IPv4 mapeado em IPv6: ::ffff:10.0.0.1
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) addr = mapped[1];

  if (addr.includes('.')) {
    const p = addr.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // formato estranho → bloqueia
    const [a, b] = p;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local + metadata (169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast/reservado
    return false;
  }

  // IPv6
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA fc00::/7
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('ff')) return true; // multicast
  return false;
}

/**
 * `lookup` para agentes HTTP que bloqueia resolução para IPs internos.
 *
 * Resolve SEMPRE todos os endereços (mesmo quando quem chamou pediu só um) por
 * dois motivos: validar cada IP contra rebinding, e poder **preferir IPv4**.
 * Muitos hosts de ERP publicam A e AAAA, mas o container do servidor costuma não
 * ter rota IPv6 — tentar o AAAA primeiro trava até estourar o timeout e o erro
 * chega sem resposta HTTP ("sem status"), sem pista do que houve.
 */
export function safeLookup(hostname: string, options: unknown, callback: (...args: unknown[]) => void): void {
  const opts = (typeof options === 'object' && options !== null ? options : {}) as Record<string, unknown>;
  const queriaTodos = opts.all === true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dnsLookup(hostname, { ...opts, all: true } as any, (err: NodeJS.ErrnoException | null, enderecos: unknown) => {
    if (err) return callback(err);
    const lista = (Array.isArray(enderecos) ? enderecos : []) as { address: string; family: number }[];
    for (const e of lista) {
      if (isPrivateIp(e.address)) {
        return callback(new Error(`SSRF bloqueado: ${hostname} resolve para IP interno (${e.address})`));
      }
    }
    if (lista.length === 0) return callback(new Error(`DNS não retornou endereço para ${hostname}`));
    const ordenados = [...lista.filter((e) => e.family === 4), ...lista.filter((e) => e.family !== 4)];
    if (queriaTodos) return callback(null, ordenados);
    callback(null, ordenados[0].address, ordenados[0].family);
  });
}

/** Agentes http/https que barram destinos internos. Use em `axios.create`. */
export function safeHttpAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpAgent: new http.Agent({ lookup: safeLookup as any }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpsAgent: new https.Agent({ lookup: safeLookup as any }),
  };
}
