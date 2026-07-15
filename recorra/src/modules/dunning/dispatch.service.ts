import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from '@/modules/channels/channel.factory';
import { nextChannel } from './fallback';

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

    const destino = this.destino(d.canal, d.customer.telefone, d.customer.email);
    if (!destino) {
      if (await this.tentarFallback(d, ['sem destino'])) throw new Error('fallback: sem destino, tentando proximo canal');
      await this.marcar(d.id, 'IGNORADO', 'Sem destino para o canal');
      return 'IGNORADO';
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

    // Idioma do template (ex.: 'en', 'pt_BR') — a Meta exige o idioma exato do template aprovado.
    let templateLanguage: string | undefined;
    if (d.templateName) {
      const tpl = await this.prisma.whatsAppTemplate.findFirst({ where: { tenantId: d.tenantId, nome: d.templateName }, select: { idioma: true } });
      templateLanguage = tpl?.idioma ?? undefined;
    }

    try {
      const channel = await this.channels.forTenantChannel(d.tenantId, d.canal, (d as { channelAccountId?: string | null }).channelAccountId);
      const res = await channel.send({
        to: destino,
        text: d.conteudo ?? '',
        templateName: d.templateName ?? undefined,
        templateParams: d.templateParams?.length ? d.templateParams : undefined,
        templateLanguage,
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
    const pendentes = await this.prisma.messageDispatch.findMany({
      where: { status: 'FILA', OR: [{ agendadoPara: null }, { agendadoPara: { lte: agora } }] },
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    let enviados = 0;
    for (const p of pendentes) {
      try {
        const r = await this.processOne(p.id);
        if (r === 'ENVIADO') enviados++;
      } catch (e) {
        this.logger.warn(`Falha ao processar disparo ${p.id}: ${String(e)}`);
      }
    }
    return { processados: pendentes.length, enviados };
  }

  private async tentarFallback(
    d: { id: string; canal: ChannelType; cadeiaCanais: ChannelType[]; tentativaFallback: number },
    motivos: string[],
  ): Promise<boolean> {
    const cadeia = d.cadeiaCanais?.length ? d.cadeiaCanais : [d.canal];
    const jaTentados = cadeia.slice(0, d.tentativaFallback + 1);
    const proximo = nextChannel(cadeia, jaTentados) as ChannelType | null;
    if (!proximo) return false;
    await this.prisma.messageDispatch.update({
      where: { id: d.id },
      data: { canal: proximo, tentativaFallback: d.tentativaFallback + 1, erro: `fallback (${motivos.join('; ')})`, status: 'FILA' },
    });
    this.logger.log(`Fallback do disparo ${d.id}: ${d.canal} -> ${proximo}`);
    return true;
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
