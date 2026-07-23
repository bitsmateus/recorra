import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { env } from '@/config/env';

interface ReguaBrief {
  negocio?: string;
  objetivo?: string;
  tom?: string;
  inicioDias?: number;
  fimDias?: number;
  toques?: number;
  canais?: string[];
  desconto?: string;
  acaoFinal?: string;
  empresa?: string;
  descricaoLivre?: string;
}

@Injectable()
export class AiService {
  private async chat(system: string, user: string, json = false): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      throw new BadRequestException('IA não configurada. Adicione OPENAI_API_KEY no .env do servidor.');
    }
    try {
      const { data } = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: env.AI_MODEL,
          temperature: 0.6,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 40000 },
      );
      return data?.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      const detail = axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e);
      throw new BadRequestException(`Falha na IA: ${detail}`);
    }
  }

  /** Gera uma régua de cobrança a partir do briefing. Retorna JSON no formato do editor. */
  async gerarRegua(brief: ReguaBrief) {
    const system = [
      'Você é especialista em régua de cobrança (dunning) para empresas brasileiras.',
      'Gere uma régua eficaz e não invasiva, com mensagens curtas, cordiais e em português do Brasil.',
      'Responda APENAS com JSON válido neste formato exato:',
      '{"nome": string, "faixaRisco": "BOM"|"ATENCAO"|"RISCO"|null, "apenasNotificar": boolean,',
      ' "steps": [{"offsetDias": number, "canal": "WHATSAPP_CLOUD"|"EMAIL"|"SMS", "template": string}]}',
      'Regras: offsetDias negativo = dias ANTES do vencimento, 0 = no dia, positivo = dias DEPOIS.',
      'Use as variáveis quando fizer sentido: {{nome}} {{valor}} {{vencimento}} {{pix}} {{link}}.',
      'SEMPRE inclua a forma de pagamento em pelo menos uma mensagem: use {{pix}} (copia e cola) e/ou {{link}} — de preferência na mensagem do dia do vencimento (offsetDias 0) e nas de cobrança (offsetDias positivo).',
      'Mesmo em tom leve/notificador, ofereça o link/pix para facilitar o pagamento. apenasNotificar deve ser false quando houver cobrança/pagamento envolvido.',
      'Prefira o canal WHATSAPP_CLOUD salvo se o usuário indicar e-mail/SMS. Máximo de passos = número de toques informado.',
    ].join(' ');

    const user = brief.descricaoLivre
      ? `Descrição do negócio e necessidade: ${brief.descricaoLivre}`
      : [
          `Negócio: ${brief.negocio || 'não informado'}`,
          `Objetivo: ${brief.objetivo || 'recuperar inadimplência'}`,
          `Tom: ${brief.tom || 'amigável'}`,
          `Começar ${brief.inicioDias ?? 3} dias antes do vencimento e insistir até ${brief.fimDias ?? 15} dias depois`,
          `Total de toques: ${brief.toques ?? 4}`,
          `Canais disponíveis: ${(brief.canais || ['WHATSAPP_CLOUD']).join(', ')}`,
          `Desconto/acordo: ${brief.desconto || 'não'}`,
          `Ação final: ${brief.acaoFinal || 'nenhuma'}`,
          `Empresa (assinatura): ${brief.empresa || ''}`,
        ].join('\n');

    const raw = await this.chat(system, user, true);
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('A IA retornou um formato inesperado. Tente novamente.'); }
    // saneia
    // Só canais que o produto ainda cria. Evolution/uazapi saíram (não oficiais).
    const canaisOk = ['WHATSAPP_CLOUD', 'EMAIL', 'SMS'];
    const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    return {
      nome: String(parsed.nome || 'Régua gerada por IA').slice(0, 80),
      faixaRisco: ['BOM', 'ATENCAO', 'RISCO'].includes(parsed.faixaRisco) ? parsed.faixaRisco : null,
      apenasNotificar: !!parsed.apenasNotificar,
      steps: steps.slice(0, 12).map((s: any, i: number) => ({
        ordem: i + 1,
        offsetDias: Number.isFinite(Number(s.offsetDias)) ? Math.max(-60, Math.min(90, Math.round(Number(s.offsetDias)))) : 0,
        canal: canaisOk.includes(s.canal) ? s.canal : 'WHATSAPP_CLOUD',
        template: String(s.template || '').slice(0, 1000),
      })),
    };
  }

  /** Reescreve/melhora uma mensagem preservando as variáveis {{...}}. */
  async melhorarMensagem(texto: string, instrucao: string) {
    const system = [
      'Você reescreve mensagens de cobrança/relacionamento para WhatsApp em português do Brasil.',
      'MUITO IMPORTANTE: preserve exatamente todas as variáveis no formato {{algo}} (não traduza nem altere).',
      'Mantenha curto, claro e cordial. Responda apenas com o texto final, sem aspas nem explicações.',
    ].join(' ');
    const user = `Instrução: ${instrucao || 'melhore a mensagem'}\n\nMensagem atual:\n${texto || ''}`;
    const out = await this.chat(system, user, false);
    return { texto: out.trim() };
  }
}
