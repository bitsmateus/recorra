import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { SaveRuleDto } from './dto/rule.dto';
import { NICHO_TEMPLATES, findNicho } from './nicho-templates';
import { evaluateAb, Variante } from './abtest';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.dunningRule.findMany({
      where: { tenantId },
      include: {
        steps: { orderBy: { ordem: 'asc' } },
        // Transparência: quais campanhas usam esta régua (a régua define COMO
        // comunicar; quem/quando fica na campanha). Somente leitura na tela.
        campaigns: { select: { id: true, nome: true, status: true }, orderBy: { nome: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(tenantId: string, id: string) {
    const rule = await this.prisma.dunningRule.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
    if (!rule) throw new NotFoundException('Regua nao encontrada');
    return rule;
  }

  create(tenantId: string, dto: SaveRuleDto) {
    return this.prisma.dunningRule.create({
      data: {
        tenantId,
        nome: dto.nome,
        nicho: dto.nicho,
        faixaRisco: dto.faixaRisco ?? null,
        apenasNotificar: dto.apenasNotificar ?? false,
        janelaInicio: dto.janelaInicio ?? 9,
        janelaFim: dto.janelaFim ?? 20,
        diasUteisSomente: dto.diasUteisSomente ?? false,
        maxMsgsDia: dto.maxMsgsDia ?? null,
        roteamentoPorCusto: dto.roteamentoPorCusto ?? false,
        ativo: dto.ativo ?? true,
        steps: {
          create: dto.steps.map((s) => ({
            ordem: s.ordem,
            offsetDias: s.offsetDias,
            canal: s.canal,
            channelAccountId: s.channelAccountId ?? null,
            canaisFallback: s.canaisFallback ?? [],
            template: s.template,
            emailAssunto: s.emailAssunto?.trim() || null,
            templateB: s.templateB ?? null,
            templateName: s.templateName ?? null,
            templateParams: s.templateParams ?? [],
            abTest: s.abTest ?? false,
            ativo: s.ativo ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async update(tenantId: string, id: string, dto: SaveRuleDto) {
    await this.get(tenantId, id);
    await this.prisma.dunningStep.deleteMany({ where: { ruleId: id } });
    return this.prisma.dunningRule.update({
      where: { id },
      data: {
        nome: dto.nome,
        nicho: dto.nicho,
        faixaRisco: dto.faixaRisco ?? null,
        apenasNotificar: dto.apenasNotificar ?? false,
        janelaInicio: dto.janelaInicio ?? 9,
        janelaFim: dto.janelaFim ?? 20,
        diasUteisSomente: dto.diasUteisSomente ?? false,
        maxMsgsDia: dto.maxMsgsDia ?? null,
        roteamentoPorCusto: dto.roteamentoPorCusto ?? false,
        ativo: dto.ativo ?? true,
        steps: {
          create: dto.steps.map((s) => ({
            ordem: s.ordem,
            offsetDias: s.offsetDias,
            canal: s.canal,
            channelAccountId: s.channelAccountId ?? null,
            canaisFallback: s.canaisFallback ?? [],
            template: s.template,
            emailAssunto: s.emailAssunto?.trim() || null,
            templateB: s.templateB ?? null,
            templateName: s.templateName ?? null,
            templateParams: s.templateParams ?? [],
            abTest: s.abTest ?? false,
            ativo: s.ativo ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.dunningRule.delete({ where: { id } });
    return { ok: true };
  }

  listNichoTemplates() {
    return NICHO_TEMPLATES.map((t) => ({ id: t.id, nicho: t.nicho, nome: t.nome, faixaRisco: t.faixaRisco, passos: t.steps.length }));
  }

  async cloneNicho(tenantId: string, templateId: string) {
    const tpl = findNicho(templateId);
    if (!tpl) throw new BadRequestException('Modelo nao encontrado');
    return this.prisma.dunningRule.create({
      data: {
        tenantId,
        nome: tpl.nome,
        nicho: tpl.nicho,
        faixaRisco: tpl.faixaRisco,
        steps: { create: tpl.steps.map((s) => ({ ordem: s.ordem, offsetDias: s.offsetDias, canal: s.canal, template: s.template })) },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async abStats(tenantId: string) {
    const dispatches = await this.prisma.messageDispatch.findMany({
      where: { tenantId, variante: { not: null }, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] } },
      include: { invoice: { select: { status: true } } },
    });

    const acc: Record<Variante, { enviados: number; pagos: number }> = { A: { enviados: 0, pagos: 0 }, B: { enviados: 0, pagos: 0 } };
    for (const d of dispatches) {
      const v = (d.variante as Variante) ?? 'A';
      if (v !== 'A' && v !== 'B') continue;
      acc[v].enviados++;
      if (d.invoice?.status === 'PAGA') acc[v].pagos++;
    }
    return evaluateAb([
      { variante: 'A', ...acc.A },
      { variante: 'B', ...acc.B },
    ]);
  }
}
