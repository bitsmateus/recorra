import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { ChannelCredentials } from '@/modules/channels/message-channel.interface';
import { NxSystemsChannel } from '@/modules/channels/providers/nx-systems.channel';
import { safeStrEq } from '@/modules/inbox/inbound-signature';
import { carteiraDaFaixa } from '@/modules/dunning/carteiras';
import { filaDestino, lerMensagemNx, MensagemNx, variacoesTelefone } from './nx-chat';

const DIA = 86_400_000;
/** Mensagem da atendente igual a um disparo do próprio Recorrai nestes minutos = eco do disparo. */
const JANELA_ECO_MS = 5 * 60_000;

export interface ResultadoNx {
  ok: boolean;
  acao: 'ignorado' | 'transferido' | 'ja-na-fila' | 'sem-fila' | 'ja-roteado' | 'falha-transferencia' | 'contato-registrado' | 'contato-ja-registrado';
  detalhe?: string;
}

/**
 * Recebe o webhook do chat NX (uma URL por conta de canal NX, com token secreto).
 * Ver nx-chat.ts para as regras de leitura do payload.
 */
@Injectable()
export class NxChatService {
  private readonly logger = new Logger(NxChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Fábrica do cliente NX — sobrescrita nos testes. */
  protected nx(creds: ChannelCredentials): Pick<NxSystemsChannel, 'transferirFila'> {
    return new NxSystemsChannel(creds);
  }

  async receber(accountId: string, token: string, raw: unknown): Promise<ResultadoNx | null> {
    const conta = await this.prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!conta || !conta.ativo || conta.canal !== 'NX_SYSTEMS') return null;
    let creds: ChannelCredentials;
    try { creds = this.crypto.decryptJson<ChannelCredentials>(conta.credentials); } catch { return null; }
    // Fail-closed: sem token gerado em Canais, ou token diferente, nada é processado.
    if (!creds.webhookSecret || !safeStrEq(token, creds.webhookSecret)) return null;

    const m = lerMensagemNx(raw);
    if (m.tipo === 'ignorar') return { ok: true, acao: 'ignorado', detalhe: m.motivo };

    const cliente = await this.acharCliente(conta.tenantId, m.telefone!);
    if (!cliente) return { ok: true, acao: 'ignorado', detalhe: 'telefone não é de um cliente cadastrado' };

    return m.tipo === 'cliente'
      ? this.rotear(conta.tenantId, conta.id, creds, m, cliente)
      : this.registrarContato(conta.tenantId, conta.id, m, cliente.id);
  }

  private async acharCliente(tenantId: string, telefone: string) {
    const variacoes = variacoesTelefone(telefone);
    const exato = await this.prisma.customer.findFirst({
      where: { tenantId, ativo: true, telefone: { in: variacoes } },
      select: { id: true, responsavelId: true },
    });
    if (exato) return exato;
    // Cadastro sem DDI/formatado diferente: casa pelos 8 últimos dígitos, só se for único.
    const final = telefone.slice(-8);
    const candidatos = await this.prisma.customer.findMany({
      where: { tenantId, ativo: true, telefone: { endsWith: final } },
      select: { id: true, responsavelId: true },
      take: 2,
    });
    return candidatos.length === 1 ? candidatos[0] : null;
  }

  /** Dias de atraso da fatura em aberto mais antiga (null = nada vencido). */
  private async atrasoDoCliente(tenantId: string, customerId: string): Promise<number | null> {
    const hoje = new Date();
    const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
    const maisAntiga = await this.prisma.invoice.findFirst({
      where: { tenantId, customerId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', vencimento: { lt: new Date(hojeUtc) } },
      orderBy: { vencimento: 'asc' },
      select: { vencimento: true },
    });
    if (!maisAntiga) return null;
    const v = maisAntiga.vencimento;
    return Math.round((hojeUtc - Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) / DIA);
  }

  // ---------------- Item 6: resposta do cliente → fila da responsável ----------------

  private async rotear(
    tenantId: string, accountId: string, creds: ChannelCredentials, m: MensagemNx,
    cliente: { id: string; responsavelId: string | null },
  ): Promise<ResultadoNx> {
    // Já tem atendente humano: quem está atendendo decide, o Recorrai não mexe.
    if (m.ticketUserId) return { ok: true, acao: 'ignorado', detalhe: 'atendimento já está com um atendente' };
    // Uma vez por atendimento: se a equipe mover o ticket depois, não brigamos com ela.
    const jaFoi = await this.prisma.nxTicketRoute.findUnique({
      where: { channelAccountId_ticketId: { channelAccountId: accountId, ticketId: m.ticketId! } },
    });
    if (jaFoi) return { ok: true, acao: 'ja-roteado' };

    // Só cliente em cobrança (fatura vencida) é roteado — os demais seguem o fluxo normal do NX.
    const dias = await this.atrasoDoCliente(tenantId, cliente.id);
    if (dias === null) return { ok: true, acao: 'ignorado', detalhe: 'cliente sem fatura vencida' };

    const [carteiras, responsavel] = await Promise.all([
      this.prisma.carteira.findMany({ where: { tenantId }, select: { id: true, nome: true, diaMinimo: true, nxQueueId: true } }),
      cliente.responsavelId
        ? this.prisma.user.findFirst({ where: { id: cliente.responsavelId, tenantId }, select: { id: true, carteiraId: true, nxQueueId: true, ativo: true } })
        : Promise.resolve(null),
    ]);
    const carteira = carteiraDaFaixa(dias, carteiras) as (typeof carteiras)[number] | null;
    const destino = filaDestino({ carteira, responsavel });
    if (!destino) return { ok: true, acao: 'sem-fila', detalhe: 'carteira/responsável sem fila do NX configurada' };

    const registrar = () => this.prisma.nxTicketRoute.create({
      data: {
        tenantId, channelAccountId: accountId, ticketId: m.ticketId!, queueId: destino.queueId,
        customerId: cliente.id, responsavelId: destino.motivo === 'responsavel' ? responsavel?.id ?? null : null, motivo: destino.motivo,
      },
    }).catch((e: { code?: string }) => { if (e?.code !== 'P2002') throw e; }); // corrida entre duas mensagens: ok

    if (m.ticketQueueId === destino.queueId) {
      await registrar();
      return { ok: true, acao: 'ja-na-fila', detalhe: `fila ${destino.queueId}` };
    }
    const r = await this.nx(creds).transferirFila(m.ticketId!, destino.queueId);
    if (!r.ok) {
      this.logger.warn(`NX updatequeue falhou (ticket ${m.ticketId} → fila ${destino.queueId}): ${r.erro}`);
      return { ok: false, acao: 'falha-transferencia', detalhe: r.erro };
    }
    await registrar();
    return { ok: true, acao: 'transferido', detalhe: `fila ${destino.queueId} (${destino.motivo})` };
  }

  // ---------------- Item 7: atendente no chat → contato manual ----------------

  private async registrarContato(tenantId: string, accountId: string, m: MensagemNx, customerId: string): Promise<ResultadoNx> {
    // Só conta como cobrança se o cliente tem fatura em aberto (o resto é suporte/venda).
    const fatura = await this.prisma.invoice.findFirst({
      where: { tenantId, customerId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      orderBy: { vencimento: 'asc' },
      select: { id: true },
    });
    if (!fatura) return { ok: true, acao: 'ignorado', detalhe: 'cliente sem fatura em aberto' };

    // Um registro por atendimento e por dia: a conversa inteira é UM contato, não N mensagens.
    const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const chave = `nxchat:${accountId}:${m.ticketId}:${dia}`;
    const existente = await this.prisma.messageDispatch.findFirst({ where: { tenantId, customerId, stepId: chave }, select: { id: true } });
    if (existente) return { ok: true, acao: 'contato-ja-registrado' };

    // Eco: o NX também avisa as mensagens que o próprio Recorrai mandou por ele.
    if (m.texto) {
      const eco = await this.prisma.messageDispatch.findFirst({
        where: {
          tenantId, customerId, conteudo: m.texto,
          NOT: { template: 'nx_chat' },
          createdAt: { gte: new Date(Date.now() - JANELA_ECO_MS) },
        },
        select: { id: true },
      });
      if (eco) return { ok: true, acao: 'ignorado', detalhe: 'eco de um disparo do Recorrai' };
    }

    const operador = await this.acharOperador(tenantId, m);
    const agora = new Date();
    try {
      await this.prisma.messageDispatch.create({
        data: {
          tenantId, customerId, invoiceId: fatura.id, channelAccountId: accountId,
          origem: 'MANUAL', userId: operador?.id ?? null,
          canal: 'NX_SYSTEMS', cadeiaCanais: ['NX_SYSTEMS'],
          template: 'nx_chat',
          conteudo: (m.texto || '[mídia enviada no chat]').slice(0, 1000),
          stepId: chave, providerMsgId: m.messageId ?? null,
          status: 'ENVIADO', agendadoPara: agora, enviadoEm: agora,
          // Atendente ainda não vinculada a um usuário (Equipe → ID no NX): guarda o nome dela.
          assunto: operador ? null : m.atendenteNome ? `Atendente no NX: ${m.atendenteNome}` : null,
        },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') return { ok: true, acao: 'contato-ja-registrado' };
      throw e;
    }
    return { ok: true, acao: 'contato-registrado', detalhe: operador ? operador.nome : m.atendenteNome ?? 'atendente sem vínculo' };
  }

  /** Usuário do Recorrai que é este atendente do NX: pelo ID vinculado em Equipe, senão pelo e-mail. */
  private async acharOperador(tenantId: string, m: MensagemNx) {
    if (m.ticketUserId) {
      const u = await this.prisma.user.findFirst({ where: { tenantId, nxUserId: m.ticketUserId }, select: { id: true, nome: true } });
      if (u) return u;
    }
    if (m.atendenteEmail) {
      return this.prisma.user.findFirst({
        where: { tenantId, email: { equals: m.atendenteEmail, mode: 'insensitive' } },
        select: { id: true, nome: true },
      });
    }
    return null;
  }
}
