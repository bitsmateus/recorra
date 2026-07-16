import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from './channel.factory';
import { renderEmail, primeiraUrl, EmailMarca } from './email-layout';
import { MODELOS_EMAIL } from './email-modelos';

export interface EmailTemplateInput {
  nome: string;
  assunto: string;
  corpo: string;
}

/** Valores de exemplo da prévia — mesmos rótulos que o painel usa. */
const EXEMPLOS: Record<string, string> = {
  nome: 'João Silva',
  documento: '123.456.789-00',
  valor: 'R$ 149,90',
  vencimento: '15/07/2026',
  pix: '00020126580014br.gov.bcb.pix0136exemplo-de-chave-copia-e-cola5204000053039865802BR',
  boleto: 'https://exemplo.com/boleto/123',
  link: 'https://pag.exemplo.com/f/abc123',
  contrato: 'CT-1234',
};

export function preencherExemplo(texto: string): string {
  return (texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => EXEMPLOS[String(k).toLowerCase()] ?? `{{${k}}}`);
}

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelFactory,
  ) {}

  list(tenantId: string) {
    return this.prisma.emailTemplate.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } });
  }

  /** Marca aplicada aos e-mails deste tenant. */
  marca(tenantId: string): Promise<EmailMarca> {
    return this.channels.marcaEmail(tenantId);
  }

  /** Grava a marca em Tenant.config.emailMarca, preservando o resto do config. */
  async salvarMarca(tenantId: string, dto: EmailMarca) {
    const cor = (dto.cor ?? '').trim();
    if (cor && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(cor)) {
      throw new BadRequestException('Cor inválida — use hexadecimal, ex.: #14857C.');
    }
    const logoUrl = (dto.logoUrl ?? '').trim();
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      throw new BadRequestException('A logo precisa ser uma URL pública (http/https) — o e-mail é aberto fora da Recorrai.');
    }
    const marca: EmailMarca = {
      empresa: (dto.empresa ?? '').trim() || undefined,
      cor: cor || undefined,
      logoUrl: logoUrl || undefined,
      assinatura: (dto.assinatura ?? '').trim() || undefined,
    };
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const atual = (tenant?.config ?? {}) as Prisma.JsonObject;
    const config: Prisma.InputJsonValue = { ...atual, emailMarca: marca as Prisma.JsonObject };
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { config } });
    return this.marca(tenantId);
  }

  /** Modelos da biblioteca que o tenant ainda não importou (compara pelo nome). */
  async disponiveis(tenantId: string) {
    const meus = await this.prisma.emailTemplate.findMany({ where: { tenantId }, select: { nome: true } });
    const nomes = new Set(meus.map((m) => m.nome.trim().toLowerCase()));
    return MODELOS_EMAIL.filter((m) => !nomes.has(m.nome.trim().toLowerCase()));
  }

  private valida(dto: EmailTemplateInput) {
    if (!dto.nome?.trim()) throw new BadRequestException('Dê um nome ao modelo');
    if (!dto.assunto?.trim()) throw new BadRequestException('Escreva o assunto do e-mail');
    if (!dto.corpo?.trim()) throw new BadRequestException('Escreva o corpo do e-mail');
  }

  async criar(tenantId: string, dto: EmailTemplateInput) {
    this.valida(dto);
    return this.prisma.emailTemplate.create({
      data: { tenantId, nome: dto.nome.trim(), assunto: dto.assunto.trim(), corpo: dto.corpo },
    });
  }

  async atualizar(tenantId: string, id: string, dto: EmailTemplateInput) {
    this.valida(dto);
    const existe = await this.prisma.emailTemplate.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existe) throw new NotFoundException('Modelo não encontrado');
    return this.prisma.emailTemplate.update({
      where: { id },
      data: { nome: dto.nome.trim(), assunto: dto.assunto.trim(), corpo: dto.corpo },
    });
  }

  async remover(tenantId: string, id: string) {
    const existe = await this.prisma.emailTemplate.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existe) throw new NotFoundException('Modelo não encontrado');
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Importa modelos da biblioteca, pulando os que o tenant já tem. */
  async importar(tenantId: string, ids?: string[]) {
    const alvo = ids?.length ? MODELOS_EMAIL.filter((m) => ids.includes(m.id)) : MODELOS_EMAIL;
    const disponiveis = await this.disponiveis(tenantId);
    const podem = new Set(disponiveis.map((m) => m.id));
    const novos = alvo.filter((m) => podem.has(m.id));
    if (novos.length) {
      await this.prisma.emailTemplate.createMany({
        data: novos.map((m) => ({ tenantId, nome: m.nome, assunto: m.assunto, corpo: m.corpo })),
      });
    }
    return { importados: novos.length, ignorados: alvo.length - novos.length };
  }

  /**
   * Devolve o HTML EXATO que o cliente receberia, com dados de exemplo.
   * A prévia do painel renderiza isto num iframe — por isso ela não pode divergir
   * do envio: é o mesmo renderEmail() que o EmailChannel usa.
   */
  async previa(tenantId: string, dto: { assunto?: string; corpo?: string }) {
    const marca: EmailMarca = await this.channels.marcaEmail(tenantId);
    const assunto = preencherExemplo(dto.assunto || '') || 'Aviso de cobrança';
    const texto = preencherExemplo(dto.corpo || '');
    const html = renderEmail({ assunto, texto, botaoUrl: primeiraUrl(texto) ?? undefined }, marca);
    return { assunto, html };
  }
}
