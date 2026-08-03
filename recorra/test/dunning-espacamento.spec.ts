import { describe, it, expect } from 'vitest';
import { dentroDaJanelaOuProximo, WindowConfig } from '@/modules/dunning/windows';

const TZ = 'America/Sao_Paulo';
const COMERCIAL: WindowConfig = { inicioHora: 9, fimHora: 20, diasUteisSomente: false };

/** Hora do relógio local do tenant (não do servidor, que roda em UTC no deploy). */
const horaEm = (d: Date, tz = TZ) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d));
const diaEm = (d: Date, tz = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Reproduz o cursor do motor: N disparos, um a cada `delaySeg`, dentro da janela. */
function agenda(n: number, inicio: Date, delaySeg: number, cfg = COMERCIAL): Date[] {
  const out: Date[] = [];
  let cursor = inicio;
  for (let i = 0; i < n; i++) {
    const quando = dentroDaJanelaOuProximo(cursor, TZ, cfg);
    out.push(quando);
    cursor = new Date(quando.getTime() + delaySeg * 1000);
  }
  return out;
}

describe('espaçamento entre mensagens da régua', () => {
  it('separa os disparos pelo intervalo configurado', () => {
    const inicio = new Date('2026-08-03T12:00:00.000Z'); // 09:00 em SP
    const [a, b, c] = agenda(3, inicio, 30);
    expect(b.getTime() - a.getTime()).toBe(30_000);
    expect(c.getTime() - b.getTime()).toBe(30_000);
  });

  it('intervalo 0 mantém o comportamento antigo (todos no mesmo instante)', () => {
    const inicio = new Date('2026-08-03T12:00:00.000Z');
    const datas = agenda(5, inicio, 0);
    expect(new Set(datas.map((d) => d.getTime())).size).toBe(1);
  });

  it('nenhum disparo cai fora da janela de horário', () => {
    // Janela 9h-20h cabe 1320 disparos a 30s; 1500 obriga a virar o dia.
    const datas = agenda(1500, new Date('2026-08-03T12:00:00.000Z'), 30);
    for (const d of datas) {
      const h = horaEm(d);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(20);
    }
  });

  it('o que não cabe no dia continua no dia seguinte, não de madrugada', () => {
    const datas = agenda(1500, new Date('2026-08-03T12:00:00.000Z'), 30);
    const dias = [...new Set(datas.map((d) => diaEm(d)))];
    expect(dias.length).toBeGreaterThan(1);
    expect(dias[0]).toBe('2026-08-03');
    // Retomada no início da janela do dia seguinte.
    const primeiroDoDia2 = datas.find((d) => diaEm(d) === dias[1])!;
    expect(horaEm(primeiroDoDia2)).toBe(9);
  });

  it('lote iniciado fora da janela começa no próximo slot, não na hora', () => {
    const madrugada = new Date('2026-08-03T06:00:00.000Z'); // 03:00 em SP
    const [primeiro] = agenda(1, madrugada, 30);
    expect(horaEm(primeiro)).toBe(9);
    expect(diaEm(primeiro)).toBe('2026-08-03');
  });

  it('só dias úteis: lote de sexta transborda para segunda', () => {
    const soUteis: WindowConfig = { ...COMERCIAL, diasUteisSomente: true };
    // 2026-08-07 é uma sexta-feira; 1500 disparos nao cabem em um dia.
    const datas = agenda(1500, new Date('2026-08-07T12:00:00.000Z'), 30, soUteis);
    const dias = [...new Set(datas.map((d) => diaEm(d)))];
    expect(dias[0]).toBe('2026-08-07'); // sexta
    expect(dias[1]).toBe('2026-08-10'); // segunda — pula o fim de semana
  });
});
