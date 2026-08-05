import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from '@/modules/channels/channel.factory';
import type { MessageChannel } from '@/modules/channels/message-channel.interface';
import { nextChannel } from './fallback';

/**
 * Canais de WhatsApp: só enviam por template aprovado. Texto livre não é entregue
 * fora da janela de 24h, e cobrança é sempre fora dela. (Responder no Inbox, dentro
 * da janela, continua livre — aquele caminho não passa por aqui.)
 */
const WHATSAPP: ChannelType[] = ['WHATSAPP_CLOUD', 'NX_SYSTEMS', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI'];

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelFactory,
  ) {}

  async processOne(dispatchId: string): Promise<'ENVIADO' | 'FALHA' | 'IGNORADO' | 'PULADO'> {
    const d = await this.prisma.messageDispatch.findUnique({ where: { id: dispatchId }, include: { customer: true } });
    if (!d || d.status !== 'FILA') return 'PULADO';

    // Campanha pausada: segura o disparo (fica na FILA e sai quando religar).
    if (d.campaignId) {
      const camp = await this.prisma.campaign.findUnique({ where: { id: d.campaignId }, select: { status: true } });
      if (camp?.status === 'PAUSADA') return 'PULADO';
    }

    // Opt-out no momento do envio (cobre revogação após o enfileiramento). Se o
    // canal atual foi revogado, tenta um fallback não-revogado antes de ignorar.
    if (await this.optOut(d.customerId, d.canal)) {
      if (await this.tentarFallback(d, ['opt-out no canal'])) throw new Error('fallback: opt-out, tentando proximo canal');
      await this.marcar(d.id, 'IGNORADO', 'Opt-out no canal (sem canal alternativo permitido)');
      return 'IGNORADO';
    }

    const destino = this.destino(d.canal, d.customer.telefone, d.customer.email);
    if (!destino) {
      if (await this.tentarFallback(d, ['sem destino'])) throw new Error('fallback: sem destino, tentando proximo canal');
      // Cadastro sem contato é FALHA, não "ignorado": ignorado não entra na conta
      // de erros e o furo passava batido — a cobrança ficava em aberto sem
      // ninguém ser avisado. Como erro, aparece em Disparos e no resumo.
      const motivo = d.canal === 'EMAIL'
        ? 'Cliente sem e-mail cadastrado — não foi possível enviar. Complete o cadastro.'
        : 'Cliente sem telefone cadastrado — não foi possível enviar. Complete o cadastro.';
      await this.marcar(d.id, 'FALHA', motivo);
      return 'FALHA';
    }

    // WhatsApp sem template: a Meta não entrega. Falha aqui com motivo claro em vez de
    // gastar a chamada e receber um erro genérico do provedor.
    if (WHATSAPP.includes(d.canal) && !d.templateName) {
      await this.marcar(d.id, 'FALHA', 'WhatsApp exige um template aprovado — texto livre não é entregue. Edite a campanha/régua e escolha um template.');
      return 'FALHA';
    }

    // O WhatsApp recusa template com parâmetro vazio (retorna ERR_SEND_TEMPLATE).
    // Falhamos com mensagem clara em vez de deixar o provedor recusar sem contexto.
    if (d.templateName && d.templateParams?.length) {
      const vazias = d.templateParams.map((p, i) => (!p || !p.trim() ? i + 1 : 0)).filter(Boolean);
      if (vazias.length) {
        await this.marcar(d.id, 'FALHA', `Template "${d.templateName}": variável(is) {{${vazias.join('}}, {{')}}} sem valor (cliente provavelmente sem cobrança em aberto). O WhatsApp não envia template com campo vazio.`);
        return 'FALHA';
      }
    }

    // Botão dinâmico (Pix / link) sem valor: o WhatsApp recusa o template inteiro
    // (ERR_SEND_TEMPLATE). Acontece quando o cliente não tem cobrança com Pix/boleto.
    // Falhamos com motivo claro em vez de tentar e receber o erro genérico da Meta/NX.
    if (d.templateName && Array.isArray(d.templateBotoes) && d.templateBotoes.length) {
      const botoes = d.templateBotoes as { subType?: string; text?: string }[];
      const semValor = botoes.filter((b) => !b.text || !b.text.trim());
      if (semValor.length) {
        const oQue = semValor.some((b) => b.subType === 'copy_code') ? 'Pix copia-e-cola' : 'link de pagamento';
        await this.marcar(d.id, 'FALHA', `Template "${d.templateName}": o botão precisa do ${oQue}, mas este cliente não tem cobrança com esse dado. Gere a cobrança (Pix/boleto) antes, ou use um template sem botão de Pix/link.`);
        return 'FALHA';
      }
      // Botão de URL só aceita um SUFIXO do domínio fixo aprovado na Meta. Se o valor
      // é uma URL completa (ex.: link/boleto do SGP, de outro domínio), a Meta recusa
      // o template inteiro (ERR_SEND_TEMPLATE). É um limite do WhatsApp, não do dado.
      const urlCompleta = botoes.filter((b) => b.subType === 'url' && /^https?:\/\//i.test((b.text ?? '').trim()));
      if (urlCompleta.length) {
        await this.marcar(d.id, 'FALHA', `Template "${d.templateName}": o botão de URL do WhatsApp só aceita um complemento de um domínio fixo definido na Meta — não uma URL completa de outro site (o link do boleto/SGP). Coloque o link no TEXTO da mensagem (variável {{link}}), não num botão de URL. Para Pix, use o botão "Copiar código" com {{pix}}.`);
        return 'FALHA';
      }
    }

    // Idioma do template (ex.: 'en', 'pt_BR') — a Meta exige o idioma exato do template aprovado.
    let templateLanguage: string | undefined;
    if (d.templateName) {
      const tpl = await this.prisma.whatsAppTemplate.findFirst({ where: { tenantId: d.tenantId, nome: d.templateName }, select: { idioma: true } });
      templateLanguage = tpl?.idioma ?? undefined;
    }

    // Constrói o canal à parte: se não há conta ativa/está desconfigurado, isso
    // lança. Antes o erro subia e o disparo VOLTAVA para a FILA, retentando para
    // sempre (368 presos, sem virar Falha). Agora tenta um canal alternativo e,
    // sem ele, marca FALHA com o motivo — o disparo para e aparece no painel.
    let channel: MessageChannel;
    try {
      channel = await this.channels.forTenantChannel(d.tenantId, d.canal, (d as { channelAccountId?: string | null }).channelAccountId);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'Canal indisponível';
      if (await this.tentarFallback(d, [motivo])) throw new Error(`fallback: ${motivo}`);
      await this.marcar(d.id, 'FALHA', motivo);
      return 'FALHA';
    }

    try {
      const res = await channel.send({
        to: destino,
        text: d.conteudo ?? '',
        assunto: (d as { assunto?: string | null }).assunto ?? undefined,
        templateName: d.templateName ?? undefined,
        templateParams: d.templateParams?.length ? d.templateParams : undefined,
        templateLanguage,
        // Botões dinâmicos (link/pix) já resolvidos no enfileiramento.
        templateButtons: Array.isArray(d.templateBotoes) && d.templateBotoes.length
          ? (d.templateBotoes as { index: number; subType: 'url' | 'copy_code'; text: string }[])
          : undefined,
      });
      if (res.status === 'ENVIADO') {
        await this.prisma.messageDispatch.update({
          where: { id: d.id },
          data: { status: 'ENVIADO', providerMsgId: res.providerMsgId, custo: res.custo, enviadoEm: new Date() },
        });
        return 'ENVIADO';
      }
      if (await this.tentarFallback(d, [res.erro ?? 'falha'])) throw new Error(`fallback apos falha: ${res.erro}`);
      await this.marcar(d.id, 'FALHA', res.erro);
      return 'FALHA';
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async processQueue(limit = 200) {
    const agora = new Date();
    const [pendentes, totalFila] = await Promise.all([
      this.prisma.messageDispatch.findMany({
        where: { status: 'FILA', OR: [{ agendadoPara: null }, { agendadoPara: { lte: agora } }] },
        take: limit,
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.messageDispatch.count({ where: { status: 'FILA' } }),
    ]);
    const c = { processados: pendentes.length, enviados: 0, falhas: 0, ignorados: 0, pulados: 0, erros: 0 };
    for (const p of pendentes) {
      try {
        const r = await this.processOne(p.id);
        if (r === 'ENVIADO') c.enviados++;
        else if (r === 'FALHA') c.falhas++;
        else if (r === 'IGNORADO') c.ignorados++;
        else if (r === 'PULADO') c.pulados++;
      } catch (e) {
        c.erros++;
        this.logger.warn(`Falha ao processar disparo ${p.id}: ${String(e)}`);
      }
    }
    // Loga sempre que há FILA — inclusive quando nada foi enviado — para diagnóstico.
    // `agendados` = presos em FILA mas com agendadoPara no futuro (não vencidos agora):
    // se for a maioria, o problema é a janela de horário da régua, não o worker.
    const agendados = totalFila - c.processados;
    if (totalFila > 0) {
      this.logger.log(`Fila: ${totalFila} em FILA · ${c.processados} vencidos processados (enviados ${c.enviados}, falhas ${c.falhas}, ignorados ${c.ignorados}, pulados ${c.pulados}, erros ${c.erros})${agendados > 0 ? ` · ${agendados} agendados para depois` : ''}`);
    }
    return c;
  }

  private async tentarFallback(
    d: { id: string; canal: ChannelType; cadeiaCanais: ChannelType[]; tentativaFallback: number; customerId: string },
    motivos: string[],
  ): Promise<boolean> {
    const cadeia = d.cadeiaCanais?.length ? d.cadeiaCanais : [d.canal];
    const jaTentados = [...cadeia.slice(0, d.tentativaFallback + 1)];
    // Procura o próximo canal PULANDO os que o cliente revogou (LGPD): trocar de
    // canal no fallback não pode reintroduzir um canal com opt-out.
    while (true) {
      const proximo = nextChannel(cadeia, jaTentados) as ChannelType | null;
      if (!proximo) return false;
      if (await this.optOut(d.customerId, proximo)) { jaTentados.push(proximo); continue; }
      await this.prisma.messageDispatch.update({
        where: { id: d.id },
        // tentativaFallback aponta para a posição do canal escolhido na cadeia,
        // para os pulados não serem retentados. channelAccountId é ZERADO: a conta
        // era do canal anterior; sem limpar, o envio sairia pela conta/provedor
        // errado (forTenantChannel constrói a partir de account.canal). Zerado, o
        // worker escolhe a conta padrão do novo canal.
        data: { canal: proximo, channelAccountId: null, tentativaFallback: cadeia.indexOf(proximo), erro: `fallback (${motivos.join('; ')})`, status: 'FILA' },
      });
      this.logger.log(`Fallback do disparo ${d.id}: ${d.canal} -> ${proximo}`);
      return true;
    }
  }

  /** Opt-out (LGPD): true se o cliente revogou o consentimento para o canal. */
  private async optOut(customerId: string, canal: ChannelType): Promise<boolean> {
    const revogado = await this.prisma.consent.findFirst({ where: { customerId, canal, status: 'REVOGADO' }, select: { id: true } });
    return !!revogado;
  }

  private destino(canal: string, telefone?: string | null, email?: string | null): string | null {
    if (canal === 'EMAIL') return email ?? null;
    return telefone ?? null;
  }

  private async marcar(id: string, status: 'FALHA' | 'IGNORADO', erro?: string | null) {
    await this.prisma.messageDispatch.update({ where: { id }, data: { status, erro: erro ?? undefined } });
  }

  async marcarFalhaDefinitiva(id: string, motivo: string) {
    await this.prisma.messageDispatch.updateMany({ where: { id, status: 'FILA' }, data: { status: 'FALHA', erro: motivo } });
  }
}
