/**
 * Roteamento inteligente de canal por CUSTO.
 * Preferência: canal grátis (ex.: WhatsApp dentro da janela de 24h) > menor custo.
 * Só considera canais disponíveis (conta configurada e ativa).
 */

export interface ChannelOption {
  canal: string;
  custo: number; // custo estimado por mensagem (R$)
  disponivel: boolean;
  gratisAgora?: boolean; // ex.: janela de 24h aberta do WhatsApp
}

/** Escolhe o melhor canal: grátis primeiro, depois o mais barato disponível. */
export function chooseChannel(options: ChannelOption[]): string | null {
  const disponiveis = options.filter((o) => o.disponivel);
  if (disponiveis.length === 0) return null;

  const gratis = disponiveis.filter((o) => o.gratisAgora || o.custo === 0);
  const pool = gratis.length > 0 ? gratis : disponiveis;

  return pool.reduce((melhor, o) => (o.custo < melhor.custo ? o : melhor)).canal;
}

/** Tabela de custo padrão (R$/msg) — ajustável por tenant/mercado. */
export const CUSTO_PADRAO: Record<string, number> = {
  WHATSAPP_CLOUD: 0.1, // utility BR aprox.
  WHATSAPP_EVOLUTION: 0.0,
  WHATSAPP_UAZAPI: 0.0,
  EMAIL: 0.001,
  SMS: 0.12,
  HTTP_GENERIC: 0.0, // custo depende do provedor externo — ajustável por tenant
  NX_SYSTEMS: 0.0, // custo cobrado pela NX/provedor — ajustável por tenant
};
