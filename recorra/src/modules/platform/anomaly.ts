/** Detecção de anomalias por tenant (observabilidade) — pura e testável. */

export interface TenantMetrics {
  enviados: number;
  falhas: number;
  filaPendente: number; // disparos presos na fila
  webhooksNaoProcessados: number;
}

export interface Anomaly {
  tipo: 'TAXA_FALHA' | 'FILA_ACUMULADA' | 'WEBHOOK_PARADO';
  severidade: 'aviso' | 'critico';
  mensagem: string;
}

/** Regras simples de alerta. */
export function detectAnomalies(m: TenantMetrics): Anomaly[] {
  const out: Anomaly[] = [];

  if (m.enviados >= 20) {
    const taxaFalha = m.falhas / (m.enviados + m.falhas);
    if (taxaFalha >= 0.5) out.push({ tipo: 'TAXA_FALHA', severidade: 'critico', mensagem: `Taxa de falha de envio alta: ${Math.round(taxaFalha * 100)}%.` });
    else if (taxaFalha >= 0.3) out.push({ tipo: 'TAXA_FALHA', severidade: 'aviso', mensagem: `Taxa de falha de envio elevada: ${Math.round(taxaFalha * 100)}%.` });
  }

  if (m.filaPendente >= 500) out.push({ tipo: 'FILA_ACUMULADA', severidade: 'critico', mensagem: `${m.filaPendente} disparos acumulados na fila.` });
  else if (m.filaPendente >= 100) out.push({ tipo: 'FILA_ACUMULADA', severidade: 'aviso', mensagem: `${m.filaPendente} disparos aguardando na fila.` });

  if (m.webhooksNaoProcessados >= 50) out.push({ tipo: 'WEBHOOK_PARADO', severidade: 'critico', mensagem: `${m.webhooksNaoProcessados} webhooks não processados.` });

  return out;
}
