import { ChannelType, RiskBand } from '@prisma/client';

/** Réguas-modelo por nicho, prontas para clonar no tenant. */

export interface TemplateStep {
  ordem: number;
  offsetDias: number;
  canal: ChannelType;
  template: string;
}
export interface NichoTemplate {
  id: string;
  nicho: string;
  nome: string;
  faixaRisco: RiskBand | null;
  steps: TemplateStep[];
}

const WA: ChannelType = 'WHATSAPP_CLOUD';
const MAIL: ChannelType = 'EMAIL';

export const NICHO_TEMPLATES: NichoTemplate[] = [
  {
    id: 'isp-padrao',
    nicho: 'Provedor de Internet',
    nome: 'ISP — régua padrão',
    faixaRisco: null,
    steps: [
      { ordem: 1, offsetDias: -3, canal: WA, template: 'Olá {{nome}}! Sua internet vence em 3 dias ({{vencimento}}), valor {{valor}}. Pague pelo Pix e evite o bloqueio: {{pix}}' },
      { ordem: 2, offsetDias: 0, canal: WA, template: '{{nome}}, hoje vence sua fatura de {{valor}}. Pix: {{pix}}' },
      { ordem: 3, offsetDias: 3, canal: WA, template: '{{nome}}, sua fatura de {{valor}} está em atraso. Para não ter o serviço interrompido, regularize pelo Pix: {{pix}}' },
      { ordem: 4, offsetDias: 7, canal: WA, template: '{{nome}}, seu acesso pode ser suspenso. Regularize hoje a fatura de {{valor}}: {{pix}}' },
    ],
  },
  {
    id: 'academia',
    nicho: 'Academia',
    nome: 'Academia — mensalidade',
    faixaRisco: null,
    steps: [
      { ordem: 1, offsetDias: -2, canal: WA, template: 'Oi {{nome}}! Bora treinar 💪 Sua mensalidade de {{valor}} vence em {{vencimento}}. Pix: {{pix}}' },
      { ordem: 2, offsetDias: 0, canal: WA, template: '{{nome}}, vence hoje sua mensalidade de {{valor}}. Mantenha seu acesso em dia: {{pix}}' },
      { ordem: 3, offsetDias: 5, canal: WA, template: '{{nome}}, sua mensalidade de {{valor}} está em atraso. Regularize e continue treinando: {{pix}}' },
    ],
  },
  {
    id: 'escola',
    nicho: 'Escola / Curso',
    nome: 'Escola — mensalidade',
    faixaRisco: null,
    steps: [
      { ordem: 1, offsetDias: -5, canal: MAIL, template: 'Prezado(a) {{nome}}, a mensalidade de {{valor}} vence em {{vencimento}}. Pague pelo link: {{link}}' },
      { ordem: 2, offsetDias: -1, canal: WA, template: '{{nome}}, a mensalidade escolar de {{valor}} vence amanhã ({{vencimento}}). Pix: {{pix}}' },
      { ordem: 3, offsetDias: 3, canal: WA, template: '{{nome}}, consta em aberto a mensalidade de {{valor}}. Evite juros regularizando: {{pix}}' },
    ],
  },
  {
    id: 'clinica',
    nicho: 'Clínica / Saúde',
    nome: 'Clínica — plano/consulta',
    faixaRisco: null,
    steps: [
      { ordem: 1, offsetDias: -2, canal: WA, template: 'Olá {{nome}}, seu plano de {{valor}} vence em {{vencimento}}. Pague pelo Pix: {{pix}}' },
      { ordem: 2, offsetDias: 2, canal: WA, template: '{{nome}}, identificamos que a fatura de {{valor}} está em aberto. Regularize pelo Pix: {{pix}}' },
    ],
  },
  {
    id: 'risco-firme',
    nicho: 'Genérico',
    nome: 'Cobrança firme (faixa Risco)',
    faixaRisco: 'RISCO',
    steps: [
      { ordem: 1, offsetDias: -5, canal: WA, template: 'Olá {{nome}}, sua fatura de {{valor}} vence em {{vencimento}}. Garanta o pagamento: {{pix}}' },
      { ordem: 2, offsetDias: 0, canal: WA, template: '{{nome}}, vence hoje sua fatura de {{valor}}. Pix: {{pix}}' },
      { ordem: 3, offsetDias: 2, canal: WA, template: '{{nome}}, fatura de {{valor}} vencida. Regularize: {{pix}}' },
      { ordem: 4, offsetDias: 5, canal: MAIL, template: '{{nome}}, consta em aberto a fatura de {{valor}} vencida em {{vencimento}}. Link: {{link}}' },
      { ordem: 5, offsetDias: 10, canal: WA, template: '{{nome}}, última chance de regularizar a fatura de {{valor}} antes das medidas de cobrança: {{pix}}' },
    ],
  },
];

export function findNicho(id: string): NichoTemplate | undefined {
  return NICHO_TEMPLATES.find((t) => t.id === id);
}
