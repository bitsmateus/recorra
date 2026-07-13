import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from '@/modules/channels/channel.factory';
import { normalizePhoneBR } from '@/common/util/normalize';
import { money } from '@/modules/dunning/template.util';
import { buildBotReply } from './negotiation';

/** Caixa de entrada unificada + chatbot de negociação. */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelFactory,
  ) {}

  // ---------- Consulta ----------

  listConversations(tenantId: string, status?: string) {
    return this.prisma.conversation.findMany({
      where: { tenantId, ...(status ? { status: status as never } : {}) },
      include: { customer: { select: { nome: true } } },
      orderBy: { ultimaMensagemEm: 'desc' },
      take: 100,
    });
  }

  async getMessages(tenantId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { naoLidas: 0 } });
    return this.prisma.inboxMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  }

  async resolve(tenantId: string, conversationId: string) {
    await this.prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { status: 'RESOLVIDA' } });
    return { ok: true };
  }

  /** Resposta humana do atendente. */
  async sendReply(tenantId: string, conversationId: string, texto: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    await this.deliver(tenantId, conv.canal, conv.contato, texto);
    await this.pushMessage(tenantId, conversationId, 'OUT', texto, userId);
    return { ok: true };
  }

  // ---------- Entrada (webhook) + chatbot ----------

  /**
   * Processa uma mensagem recebida do cliente: registra na conversa e aciona
   * o chatbot de negociação (auto-resposta + ações).
   */
  async handleInbound(accountId: string, from: string, texto: string) {
    const account = await this.prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!account) return { ok: true };
    const tenantId = account.tenantId;
    const contato = normalizePhoneBR(from) ?? from;

    // acha o cliente pelo telefone
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, telefone: contato } });

    // acha/abre a conversa
    let conv = await this.prisma.conversation.findFirst({ where: { tenantId, canal: account.canal, contato } });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { tenantId, canal: account.canal, contato, customerId: customer?.id, status: 'ABERTA' },
      });
    }
    await this.pushMessage(tenantId, conv.id, 'IN', texto, 'cliente');

    // contexto da negociação
    const vencida = customer
      ? await this.prisma.invoice.findFirst({
          where: { tenantId, customerId: customer.id, status: 'VENCIDA' },
          orderBy: { vencimento: 'asc' },
        })
      : null;

    const action = buildBotReply(texto, {
      nome: customer?.nome?.split(' ')[0],
      temVencida: !!vencida,
      valor: vencida ? money(Number(vencida.valor)) : undefined,
      pix: vencida?.pixCopiaCola ?? undefined,
      permiteAcordo: true,
      descontoMax: 20,
    });

    // registra a intenção na última mensagem IN
    await this.prisma.conversation.update({ where: { id: conv.id }, data: {} });

    // resposta do bot
    await this.deliver(tenantId, account.canal, contato, action.reply);
    await this.pushMessage(tenantId, conv.id, 'OUT', action.reply, 'bot', action.intent);

    // ações
    if (action.enviarPix && vencida?.pixCopiaCola) {
      await this.deliver(tenantId, account.canal, contato, vencida.pixCopiaCola);
      await this.pushMessage(tenantId, conv.id, 'OUT', vencida.pixCopiaCola, 'bot');
    }
    if (action.marcarContestada && vencida) {
      await this.prisma.invoice.update({ where: { id: vencida.id }, data: { contestada: true } });
    }
    if (action.registrarOptOut && customer) {
      await this.prisma.consent.create({ data: { customerId: customer.id, canal: account.canal, status: 'REVOGADO', origem: 'chatbot' } });
    }
    if (action.encaminharHumano || action.abrirAcordo) {
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { status: 'PENDENTE' } });
    }

    return { ok: true, intent: action.intent };
  }

  // ---------- helpers ----------

  private async deliver(tenantId: string, canal: ChannelType, to: string, texto: string) {
    try {
      const channel = await this.channels.forTenantChannel(tenantId, canal);
      await channel.send({ to, text: texto });
    } catch (e) {
      this.logger.warn(`Falha ao responder no inbox (${canal}): ${String(e)}`);
    }
  }

  private async pushMessage(tenantId: string, conversationId: string, direcao: 'IN' | 'OUT', texto: string, autor: string, intent?: string) {
    await this.prisma.inboxMessage.create({ data: { tenantId, conversationId, direcao, texto, autor, intent } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ultimaMensagem: texto.slice(0, 120),
        ultimaMensagemEm: new Date(),
        ...(direcao === 'IN' ? { naoLidas: { increment: 1 } } : {}),
      },
    });
  }
}
