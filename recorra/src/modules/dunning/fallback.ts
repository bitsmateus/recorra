/** Fallback multicanal — escolhe o próximo canal quando o anterior falha. */

/** Monta a cadeia de tentativa: canal principal + fallbacks (sem duplicar). */
export function channelChain(principal: string, fallbacks: string[] = []): string[] {
  const chain = [principal, ...fallbacks];
  return chain.filter((c, i) => chain.indexOf(c) === i);
}

/**
 * Próximo canal a tentar, dado o que já falhou. Retorna null se acabaram as
 * opções (todos os canais da cadeia já foram tentados sem sucesso).
 */
export function nextChannel(chain: string[], jaTentados: string[]): string | null {
  for (const canal of chain) {
    if (!jaTentados.includes(canal)) return canal;
  }
  return null;
}
