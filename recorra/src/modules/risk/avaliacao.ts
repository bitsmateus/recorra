/**
 * Score de risco v2 — puro e testável.
 *
 * Medido pelas ÚLTIMAS cobranças PAGAS do cliente (o comportamento recente é o
 * que prevê o próximo pagamento), mais o que está vencido e em aberto agora.
 * Cada ponto ganho/perdido vira um "fator" com o motivo em português, exibido no
 * painel do cliente.
 *
 * 100 = paga sempre em dia. Faixas (bands.ts): >= 70 Bom pagador, >= 30 Atenção,
 * abaixo disso Risco.
 */
import { bandFromScore, Band } from './bands';

export const ULTIMAS_PAGAS = 6;
/** Até este atraso o pagamento ainda conta como "em dia" (compensação, fim de semana). */
export const TOLERANCIA_DIAS = 2;

export interface FaturaRisco {
  status: string;
  vencimento: Date;
  pagoEm?: Date | null;
}

export interface FatorRisco { fator: string; pontos: number; detalhe: string }
export interface PagamentoRecente { vencimento: string; pagoEm: string; diasAtraso: number }

export interface AvaliacaoRisco {
  score: number;
  faixa: Band;
  fatores: FatorRisco[];
  historico: PagamentoRecente[];
}

const DIA = 86_400_000;
const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const br = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const atraso = (venc: Date, pago: Date) => Math.max(0, Math.round((dia(pago) - dia(venc)) / DIA));

export function avaliarRisco(faturas: FaturaRisco[], now = new Date()): AvaliacaoRisco {
  const pagas = faturas
    .filter((f) => f.status === 'PAGA' && f.pagoEm)
    .sort((a, b) => b.vencimento.getTime() - a.vencimento.getTime())
    .slice(0, ULTIMAS_PAGAS);
  const historico: PagamentoRecente[] = pagas.map((f) => ({
    vencimento: f.vencimento.toISOString(),
    pagoEm: f.pagoEm!.toISOString(),
    diasAtraso: atraso(f.vencimento, f.pagoEm!),
  }));

  const fatores: FatorRisco[] = [];
  let score = 100;

  if (!historico.length) {
    score = 60;
    fatores.push({ fator: 'sem_historico', pontos: -40, detalhe: 'Ainda não há cobranças pagas para medir o comportamento' });
  } else {
    const dias = historico.map((h) => h.diasAtraso);
    const media = dias.reduce((a, b) => a + b, 0) / dias.length;
    const emDia = dias.filter((d) => d <= TOLERANCIA_DIAS).length;
    const pior = historico.reduce((a, b) => (b.diasAtraso > a.diasAtraso ? b : a));
    const n = historico.length;
    const base = `Últimas ${n} cobrança(s) paga(s)`;

    let pMedia = 0;
    if (media > 30) pMedia = -65;
    else if (media > 15) pMedia = -50;
    else if (media > 7) pMedia = -35;
    else if (media > TOLERANCIA_DIAS) pMedia = -15;
    fatores.push({
      fator: 'atraso_medio', pontos: pMedia,
      detalhe: `${base}: atraso médio de ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s)`,
    });
    fatores.push({ fator: 'pagas_em_dia', pontos: 0, detalhe: `${emDia} de ${n} paga(s) em dia (até ${TOLERANCIA_DIAS} dias de tolerância)` });
    if (pior.diasAtraso > 30) {
      fatores.push({ fator: 'pior_atraso', pontos: -10, detalhe: `Maior atraso recente: ${pior.diasAtraso} dias (vencimento ${br(new Date(pior.vencimento))})` });
    }
    // Tendência: a última paga atrasou bem mais que a média das anteriores.
    if (n >= 3) {
      const anteriores = dias.slice(1);
      const mediaAnt = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
      if (dias[0] > TOLERANCIA_DIAS && dias[0] >= mediaAnt + 10) {
        fatores.push({ fator: 'piorando', pontos: -10, detalhe: `Piorando: a última foi paga com ${dias[0]} dias de atraso (antes, ${Math.round(mediaAnt)} em média)` });
      } else if (dias[0] <= TOLERANCIA_DIAS && mediaAnt > 7) {
        fatores.push({ fator: 'melhorando', pontos: 10, detalhe: 'Melhorando: a última cobrança foi paga em dia' });
      }
    }
    score += fatores.reduce((s, f) => s + f.pontos, 0);
  }

  // O que está vencido e em aberto agora pesa por cima do histórico.
  const vencidas = faturas.filter((f) => f.status === 'VENCIDA' || (f.status === 'PENDENTE' && dia(f.vencimento) < dia(now)));
  if (vencidas.length) {
    const maisAntiga = vencidas.reduce((a, b) => (b.vencimento < a.vencimento ? b : a));
    const d = Math.round((dia(now) - dia(maisAntiga.vencimento)) / DIA);
    const p = d > 45 ? -30 : d > 15 ? -20 : -10;
    fatores.push({
      fator: 'em_aberto', pontos: p,
      detalhe: `${vencidas.length} cobrança(s) vencida(s) em aberto — a mais antiga há ${d} dia(s)`,
    });
    score += p;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, faixa: bandFromScore(score), fatores, historico };
}
