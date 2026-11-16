import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { AuthUser } from '@/common/auth/jwt.types';
import { TELAS, Tela, telasEfetivas, telasPadrao } from '@/common/auth/telas';

/**
 * Gestão de usuários do tenant: criação com senha, listagem, papéis.
 *
 * Não há convite por e-mail: quem administra cria o usuário já com a senha e passa
 * as credenciais. O fluxo antigo dependia de um provedor de e-mail configurado e
 * apontava para uma página de aceite que nunca existiu no painel.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, senhaHash: true, emailVerify: true, twoFaEnabled: true, createdAt: true,
        carteiraId: true, carteira: { select: { id: true, nome: true } },
        nxUserId: true, nxQueueId: true, telas: true, telasCustom: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    // `semSenha` sai do próprio hash, não de uma flag que pode divergir: sem senha,
    // o usuário simplesmente não consegue entrar.
    return rows.map(({ senhaHash, telas, ...u }) => ({ ...u, semSenha: !senhaHash, telas: telasEfetivas({ ...u, telas }) }));
  }

  /** Cria o usuário já pronto para entrar: e-mail + senha definidos por quem administra. */
  async criar(tenantId: string, actorRole: UserRole, dto: { nome: string; email: string; senha: string; role: UserRole }) {
    // Só um OWNER pode criar outro OWNER (evita escalada ADMIN → OWNER).
    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode conceder o papel OWNER');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new ConflictException('Já existe um usuário com esse e-mail');

    const senhaHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    const criado = await this.prisma.user.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        email,
        role: dto.role,
        senhaHash,
        // Sem convite: a conta nasce ativa e com o e-mail dado como verificado —
        // quem administra é quem informou o endereço.
        convidado: false,
        emailVerify: true,
        ativo: true,
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
    await this.audit.record({
      tenantId, userId: undefined, acao: 'user.create', entidade: 'User', entidadeId: criado.id,
      depois: { email: criado.email, role: criado.role }, // nunca a senha
    });
    return criado;
  }

  /** Define ou troca a senha de um usuário do tenant (destrava quem ficou sem senha). */
  async definirSenha(tenantId: string, actor: AuthUser, userId: string, senha: string) {
    const alvo = await this.assertTenant(tenantId, userId);
    // Mesma regra dos outros pontos: mexer num OWNER exige ser OWNER.
    if (alvo.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode trocar a senha de outro OWNER');
    }
    const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { senhaHash, convidado: false, emailVerify: true, inviteToken: null, inviteTokenExp: null },
    });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.senha.definir', entidade: 'User', entidadeId: userId,
      depois: { email: alvo.email }, // nunca a senha
    });
    return { ok: true };
  }

  async updateRole(tenantId: string, actor: AuthUser, userId: string, role: UserRole) {
    const alvo = await this.assertTenant(tenantId, userId);
    // Não pode alterar o próprio papel (evita auto-promoção).
    if (userId === actor.id) throw new ForbiddenException('Você não pode alterar o próprio papel');
    // Só OWNER concede OWNER ou altera o papel de um OWNER existente.
    if ((role === 'OWNER' || alvo.role === 'OWNER') && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode conceder ou remover o papel OWNER');
    }
    // Não deixar o tenant sem nenhum OWNER ativo.
    if (alvo.role === 'OWNER' && role !== 'OWNER') await this.assertNaoUltimoOwner(tenantId, userId);
    const upd = await this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
    // Encerra as sessões abertas para o novo papel valer imediatamente
    // (o refresh re-lê o role do banco, mas invalidar já corta o access atual).
    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => undefined);
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.role.update', entidade: 'User', entidadeId: userId,
      antes: { role: alvo.role }, depois: { role },
    });
    return upd;
  }

  /** Carteira (equipe) do operador na esteira — define qual faixa de dias ele enxerga. */
  async updateCarteira(tenantId: string, actor: AuthUser, userId: string, carteiraId: string | null) {
    const alvo = await this.assertTenant(tenantId, userId);
    if (carteiraId) {
      const carteira = await this.prisma.carteira.findFirst({ where: { id: carteiraId, tenantId } });
      if (!carteira) throw new BadRequestException('Carteira não encontrada neste tenant');
    }
    const upd = await this.prisma.user.update({ where: { id: userId }, data: { carteiraId }, select: { id: true, carteiraId: true } });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.carteira.update', entidade: 'User', entidadeId: userId,
      antes: { carteiraId: alvo.carteiraId }, depois: { carteiraId },
    });
    return upd;
  }

  async meuPerfil(tenantId: string, userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true, nome: true, email: true, role: true, emailVerify: true, twoFaEnabled: true, createdAt: true, provider: true,
        carteira: { select: { nome: true, diaMinimo: true } }, nxUserId: true, nxQueueId: true,
        telas: true, telasCustom: true,
        tenant: { select: { nome: true } },
      },
    });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    const [clientes, vencidos] = await Promise.all([
      this.prisma.customer.count({ where: { tenantId, responsavelId: userId, ativo: true } }),
      this.prisma.customer.count({ where: { tenantId, responsavelId: userId, ativo: true, invoices: { some: { status: 'VENCIDA' } } } }),
    ]);
    return { ...u, telas: telasEfetivas(u), empresa: u.tenant.nome, tenant: undefined, clientesResponsavel: clientes, clientesVencidos: vencidos };
  }

  async editarMeuPerfil(tenantId: string, userId: string, nome?: string) {
    const n = (nome ?? '').trim();
    if (n.length < 2 || n.length > 80) throw new BadRequestException('Informe um nome entre 2 e 80 caracteres');
    await this.assertTenant(tenantId, userId);
    await this.prisma.user.update({ where: { id: userId }, data: { nome: n } });
    await this.audit.record({ tenantId, userId, acao: 'user.perfil.update', entidade: 'User', entidadeId: userId, depois: { nome: n } });
    return this.meuPerfil(tenantId, userId);
  }

  async trocarMinhaSenha(tenantId: string, userId: string, senhaAtual: string, novaSenha: string) {
    const u = await this.assertTenant(tenantId, userId);
    const completo = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { senhaHash: true } });
    if (completo.senhaHash && !(await argon2.verify(completo.senhaHash, senhaAtual).catch(() => false))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    if (novaSenha.length < 8) throw new BadRequestException('A nova senha precisa ter pelo menos 8 caracteres');
    if (novaSenha === senhaAtual) throw new BadRequestException('A nova senha precisa ser diferente da atual');
    const senhaHash = await argon2.hash(novaSenha, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: userId }, data: { senhaHash, resetToken: null, resetTokenExp: null } });
    // Encerra todas as sessões (inclusive em outros aparelhos): entra de novo com a senha nova.
    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => undefined);
    await this.audit.record({ tenantId, userId, acao: 'user.senha.propria', entidade: 'User', entidadeId: userId });
    return { ok: true };
  }

  /** Catálogo de telas + padrão de cada papel (para a janela "Telas" em Equipe). */
  catalogoTelas() {
    return {
      telas: TELAS,
      padrao: Object.fromEntries(['OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR', 'LEITURA'].map((r) => [r, telasPadrao(r)])),
    };
  }

  /** Telas que a pessoa vê. `telas: null` volta ao padrão do papel. OWNER sempre vê tudo. */
  async updateTelas(tenantId: string, actor: AuthUser, userId: string, telas: string[] | null) {
    const alvo = await this.assertTenant(tenantId, userId);
    if (alvo.role === 'OWNER') throw new BadRequestException('O dono da conta sempre vê todas as telas');
    const validas = TELAS.map((t) => t.chave) as string[];
    const lista = telas === null ? [] : [...new Set(telas)].filter((t) => validas.includes(t));
    if (telas !== null && lista.length !== new Set(telas).size) throw new BadRequestException('Tela desconhecida na lista');
    const data = telas === null ? { telas: [], telasCustom: false } : { telas: lista as Tela[], telasCustom: true };
    await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.telas.update', entidade: 'User', entidadeId: userId,
      depois: { telas: telas === null ? 'padrão do papel' : lista },
    });
    return { id: userId, telas: telasEfetivas({ role: alvo.role, ...data }), telasCustom: data.telasCustom };
  }

  /** Vínculo com o NX: id do usuário lá (contato manual no chat) e fila pessoal (respostas dos clientes dele). */
  async updateNx(tenantId: string, actor: AuthUser, userId: string, nxUserId: unknown, nxQueueId: unknown) {
    const alvo = await this.assertTenant(tenantId, userId);
    const id = (v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('IDs do NX são números inteiros positivos');
      return n;
    };
    const data = { nxUserId: id(nxUserId), nxQueueId: id(nxQueueId) };
    if (data.nxUserId) {
      const outro = await this.prisma.user.findFirst({ where: { tenantId, nxUserId: data.nxUserId, id: { not: userId } }, select: { nome: true } });
      if (outro) throw new BadRequestException(`O usuário ${data.nxUserId} do NX já está vinculado a ${outro.nome}`);
    }
    const upd = await this.prisma.user.update({ where: { id: userId }, data, select: { id: true, nxUserId: true, nxQueueId: true } });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.nx.update', entidade: 'User', entidadeId: userId,
      antes: { nxUserId: (alvo as { nxUserId?: number | null }).nxUserId ?? null, nxQueueId: (alvo as { nxQueueId?: number | null }).nxQueueId ?? null },
      depois: data,
    });
    return upd;
  }

  async setAtivo(tenantId: string, actor: AuthUser, userId: string, ativo: boolean) {
    const alvo = await this.assertTenant(tenantId, userId);
    if (userId === actor.id && !ativo) throw new ForbiddenException('Você não pode desativar a própria conta');
    if (alvo.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode desativar outro OWNER');
    }
    if (alvo.role === 'OWNER' && !ativo) await this.assertNaoUltimoOwner(tenantId, userId);
    const upd = await this.prisma.user.update({ where: { id: userId }, data: { ativo }, select: { id: true, ativo: true } });
    // Ao desativar, revoga as sessões: o access atual expira em minutos e o
    // refresh passa a ser rejeitado (refresh() também checa `ativo`).
    if (!ativo) await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => undefined);
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.ativo.update', entidade: 'User', entidadeId: userId,
      antes: { ativo: alvo.ativo }, depois: { ativo },
    });
    return upd;
  }

  private async assertTenant(tenantId: string, userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!u) throw new BadRequestException('Usuário não encontrado neste tenant');
    return u;
  }

  /** Garante que não estamos removendo/rebaixando o último OWNER ativo do tenant. */
  private async assertNaoUltimoOwner(tenantId: string, excetoUserId: string) {
    const outros = await this.prisma.user.count({
      where: { tenantId, role: 'OWNER', ativo: true, id: { not: excetoUserId } },
    });
    if (outros === 0) throw new BadRequestException('O tenant precisa de ao menos um OWNER ativo');
  }
}
