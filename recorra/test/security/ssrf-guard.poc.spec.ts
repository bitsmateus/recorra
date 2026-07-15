import { describe, it, expect } from 'vitest';
import { isPrivateIp } from '@/common/net/safe-http';

/** R-07 — o guard de SSRF deve bloquear destinos internos. */
describe('[R-07] isPrivateIp', () => {
  it('bloqueia IPs internos/privados/metadata', () => {
    for (const ip of [
      '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.5.5', '172.31.255.255',
      '192.168.0.1', '169.254.169.254', '100.64.0.1', '224.0.0.1',
      '::1', '::', 'fc00::1', 'fd12::34', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('permite IPs públicos', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '52.20.10.5', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});
