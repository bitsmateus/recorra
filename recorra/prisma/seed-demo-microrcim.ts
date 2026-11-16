/**
 * Base de DEMONSTRAÇÃO "Microrcim Telecom" — cliente modelo para apresentar a
 * esteira, a distribuição automática e o relatório Disparos × Recuperado com
 * números coerentes (não é dado real: nomes, CPFs, telefones e números de
 * WhatsApp são fictícios; as contas de canal apontam para um host inválido, então
 * nada é enviado de verdade).
 *
 * Rode com:  npm run seed:demo
 * Login:     antonio@microrcim.demo / recorra123 (dono) — operadoras: lais@, graciele@,
 *            izabel@, iasmim@ (mesma senha). Recria o tenant do zero a cada execução.
 *
 * Como é montada (relativo à data de hoje):
 *  - 2 carteiras: Cobrança 1 (D+5, Laís/Graciele) e Cobrança 2 (D+30, Izabel/Iasmim),
 *    ambas com distribuição automática balanceada.
 *  - Linhas fictícias: 1000 (avisos), 2000 (Cobrança 1), 3000 (Cobrança 2), e-mail e SMS.
 *  - 520 clientes com 3 mensalidades (2 meses atrás, mês passado, este mês). O
 *    comportamento de pagamento depende da faixa de risco do cliente.
 *  - Disparos da régua nos dias dos passos (até o pagamento) e contatos manuais das
 *    operadoras (WhatsApp da carteira + notas/promessas), com quem enviou gravado.
 *  - A atribuição e a distribuição rodam com os MESMOS serviços da aplicação.
 */
import { ChannelType, PrismaClient, RiskBand } from '@prisma/client';
import * as argon2 from 'argon2';
import { encryptWith } from '../src/common/crypto/aes';
import { AtribuicaoService } from '../src/modules/recuperacao/atribuicao.service';
import { DistribuicaoService } from '../src/modules/recuperacao/distribuicao.service';
import { carteiraDaFaixa } from '../src/modules/dunning/carteiras';
import { RiskScoringService } from '../src/modules/risk/risk-scoring.service';

const prisma = new PrismaClient();
const TENANT_ID = 'demo-microrcim';
const DIA = 86_400_000;

// PRNG determinístico: a mesma execução gera sempre a mesma base.
let semente = 20261113;
function rnd(): number {
  semente |= 0; semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const escolher = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Paulo', 'Rafaela', 'Samuel', 'Tatiane', 'Vinícius', 'Yasmin', 'André', 'Beatriz', 'Caio', 'Débora', 'Elias', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Juliana', 'Leandro', 'Marcos', 'Natália', 'Otávio', 'Patrícia', 'Renato', 'Simone', 'Thiago', 'Vanessa'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas'];
const PLANOS = [{ nome: 'Fibra 300 Mega', valor: 79.9 }, { nome: 'Fibra 500 Mega', valor: 99.9 }, { nome: 'Fibra 700 Mega', valor: 129.9 }, { nome: 'Fibra 1 Giga', valor: 149.9 }];

/** Data (UTC meia-noite) do dia civil de hoje + n dias. */
function diaUtc(base: Date, n = 0): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + n * DIA);
}
/** Um horário de expediente (SP = UTC-3) no dia civil indicado. */
function horario(diaUtc0: Date, horaIni = 9, horaFim = 17): Date {
  return new Date(diaUtc0.getTime() + (entre(horaIni, horaFim) + 3) * 3_600_000 + entre(0, 59) * 60_000);
}

async function main() {
  const agora = new Date();
  const hoje = diaUtc(agora);
  const senhaHash = await argon2.hash('recorra123', { type: argon2.argon2id });
  const chave = process.env.ENCRYPTION_KEY;
  if (!chave) throw new Error('ENCRYPTION_KEY não definida (.env)');

  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  await prisma.tenant.create({
    data: {
      id: TENANT_ID, nome: 'Microrcim Telecom (demonstração)', plano: 'PROFISSIONAL',
      usarFaixaRisco: true, janelaAtribuicaoDias: 7,
    },
  });

  // ---------------- Equipe e carteiras ----------------
  // Filas e IDs do NX fictícios (itens 6/7): equipe 10/20, fila pessoal 11–14, usuários 101–104.
  const c1 = await prisma.carteira.create({ data: { tenantId: TENANT_ID, nome: 'Cobrança 1', diaMinimo: 5, distribuicao: 'BALANCEADA', nxQueueId: 10 } });
  const c2 = await prisma.carteira.create({ data: { tenantId: TENANT_ID, nome: 'Cobrança 2', diaMinimo: 30, distribuicao: 'BALANCEADA', nxQueueId: 20 } });
  let nxSeq = 0;
  const user = (nome: string, email: string, role: 'OWNER' | 'ADMIN' | 'OPERADOR', carteiraId?: string) => {
    const nx = carteiraId ? ++nxSeq : 0;
    return prisma.user.create({
      data: { tenantId: TENANT_ID, nome, email, senhaHash, role, emailVerify: true, carteiraId, ...(nx ? { nxUserId: 100 + nx, nxQueueId: 10 + nx } : {}) },
    });
  };
  await user('Antônio Júnior', 'antonio@microrcim.demo', 'OWNER');
  await user('Tais Oliveira', 'tais@microrcim.demo', 'ADMIN');
  const lais = await user('Laís', 'lais@microrcim.demo', 'OPERADOR', c1.id);
  const graciele = await user('Graciele Alves', 'graciele@microrcim.demo', 'OPERADOR', c1.id);
  const izabel = await user('Izabel Cristinna', 'izabel@microrcim.demo', 'OPERADOR', c2.id);
  const iasmim = await user('Iasmim Rodrigues', 'iasmim@microrcim.demo', 'OPERADOR', c2.id);
  const equipe = { [c1.id]: [lais.id, graciele.id], [c2.id]: [izabel.id, iasmim.id] };
  // Operadora "dona" do cliente em cada carteira — estável, metade para cada.
  const donoDe = (customerId: string, carteiraId: string) => equipe[carteiraId][customerId.charCodeAt(customerId.length - 1) % 2];

  // ---------------- Canais (fictícios — host .invalid nunca resolve) ----------------
  const nx = (apiId: string) => encryptWith(chave, JSON.stringify({ nxBaseUrl: `https://demo.invalid/v2/api/external/${apiId}`, nxToken: 'demo', nxOficial: true }));
  const conta = (apelido: string, numero: string | null, canal: ChannelType, credentials: string) =>
    prisma.channelAccount.create({ data: { tenantId: TENANT_ID, apelido, numero, canal, credentials } });
  const l1000 = await conta('Avisos de vencimento', '1000', 'NX_SYSTEMS', nx('1000'));
  const l2000 = await conta('Cobrança 1', '2000', 'NX_SYSTEMS', nx('2000'));
  const l3000 = await conta('Cobrança 2', '3000', 'NX_SYSTEMS', nx('3000'));
  const email = await conta('E-mail cobrança', null, 'EMAIL', encryptWith(chave, JSON.stringify({ provider: 'smtp', host: 'smtp.demo.invalid', from: 'cobranca@microrcim.demo' })));
  const sms = await conta('SMS (Contel)', null, 'SMS', encryptWith(chave, JSON.stringify({ apiKey: 'demo' })));
  const linhaDaCarteira = { [c1.id]: l2000.id, [c2.id]: l3000.id };

  // ---------------- Réguas por faixa (antes e depois do vencimento, multicanal) ----------------
  type Passo = { offsetDias: number; canal: ChannelType; channelAccountId: string; template: string; emailAssunto?: string };
  const W = (o: number, conta: string, t: string): Passo => ({ offsetDias: o, canal: 'NX_SYSTEMS', channelAccountId: conta, template: t });
  const E = (o: number, t: string): Passo => ({ offsetDias: o, canal: 'EMAIL', channelAccountId: email.id, template: t, emailAssunto: 'Microrcim — sua fatura de {{valor}}' });
  const S = (o: number, t: string): Passo => ({ offsetDias: o, canal: 'SMS', channelAccountId: sms.id, template: t });
  const passosBase: Passo[] = [
    W(-3, l1000.id, 'Olá {{nome}}! Sua fatura Microrcim de {{valor}} vence em {{vencimento}}. Pix: {{pix}}'),
    W(0, l1000.id, '{{nome}}, hoje vence sua fatura de {{valor}}. Pague pelo Pix e evite juros: {{pix}}'),
    W(3, l1000.id, '{{nome}}, não identificamos o pagamento da fatura de {{valor}} (venc. {{vencimento}}). Pix: {{pix}}'),
    E(5, '{{nome}}, consta em aberto a fatura de {{valor}} vencida em {{vencimento}}. Link: {{link}}'),
    W(7, l2000.id, '{{nome}}, sua conexão pode ser reduzida. Regularize a fatura de {{valor}}: {{pix}}'),
    S(10, 'Microrcim: fatura de {{valor}} em aberto. Regularize: {{link}}'),
    W(15, l2000.id, '{{nome}}, ainda consta a fatura de {{valor}}. Podemos negociar? Responda esta mensagem.'),
    W(30, l3000.id, '{{nome}}, sua fatura está há 30 dias em aberto. Fale com a nossa equipe para evitar a suspensão.'),
    E(45, '{{nome}}, seu contrato está sujeito a rescisão por falta de pagamento. Regularize: {{link}}'),
    W(60, l3000.id, '{{nome}}, última chance de negociar antes da rescisão do contrato. Responda esta mensagem.'),
  ];
  const reguas: Record<RiskBand, { id: string; nome: string; passos: Passo[] }> = {} as never;
  for (const [faixa, nome, filtro] of [
    ['BOM', 'Bom pagador', (p: Passo) => p.offsetDias !== 10],
    ['ATENCAO', 'Atenção', () => true],
    ['RISCO', 'Alto risco', () => true],
  ] as [RiskBand, string, (p: Passo) => boolean][]) {
    const passos = passosBase.filter(filtro).map((p) => (faixa === 'RISCO' && p.offsetDias === -3 ? { ...p, offsetDias: -5 } : p));
    const r = await prisma.dunningRule.create({
      data: {
        tenantId: TENANT_ID, nome, faixaRisco: faixa, delaySegundos: 20,
        steps: { create: passos.map((p, i) => ({ ordem: i + 1, ...p })) },
      },
    });
    reguas[faixa] = { id: r.id, nome, passos };
  }

  // ---------------- Clientes e mensalidades ----------------
  const meses = [-2, -1, 0].map((m) => ({ ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + m }));
  type Toque = { data: Date; origem: 'REGUA' | 'MANUAL'; canal: ChannelType; contaId: string; userId?: string; texto: string; passo?: number; chat?: boolean };
  const dispatches: Record<string, unknown>[] = [];
  const notas: Record<string, unknown>[] = [];
  const pagas: { id: string; customerId: string; pagoEm: Date; diasAtraso: number }[] = [];
  const vendidos = new Set<string>();

  for (let i = 0; i < 520; i++) {
    const nome = `${escolher(NOMES)} ${escolher(SOBRENOMES)} ${escolher(SOBRENOMES)}`;
    let doc: string;
    do { doc = String(entre(100_000_000, 999_999_999)) + String(entre(10, 99)); } while (vendidos.has(doc));
    vendidos.add(doc);
    const r = rnd();
    const faixa: RiskBand = r < 0.5 ? 'BOM' : r < 0.82 ? 'ATENCAO' : 'RISCO';
    const plano = escolher(PLANOS);
    const vencDia = escolher([5, 10, 15, 20]);
    const cliente = await prisma.customer.create({
      data: {
        tenantId: TENANT_ID, nome, doc, contrato: String(10_000 + i),
        telefone: `55119${String(entre(10_000_000, 99_999_999))}`,
        email: rnd() < 0.7 ? `cliente${i + 1}@exemplo.com.br` : null,
        plano: plano.nome, valorPlano: plano.valor, cidade: 'Microrcim (demo)', uf: 'SP',
        statusContrato: 'ativo', faixaAtual: faixa,
      },
    });
    const regua = reguas[faixa];

    for (const m of meses) {
      const venc = new Date(Date.UTC(m.ano, m.mes, vencDia));
      // Dia (relativo ao vencimento) em que paga; null = continua em aberto.
      const sorte = rnd();
      let pagaEm: number | null;
      if (faixa === 'BOM') pagaEm = sorte < 0.82 ? entre(-4, 1) : sorte < 0.97 ? entre(3, 9) : null;
      else if (faixa === 'ATENCAO') pagaEm = sorte < 0.3 ? entre(-2, 2) : sorte < 0.72 ? entre(3, 14) : sorte < 0.88 ? entre(15, 40) : null;
      else pagaEm = sorte < 0.1 ? entre(-1, 3) : sorte < 0.35 ? entre(5, 20) : sorte < 0.6 ? entre(25, 70) : null;

      const diaPag = pagaEm === null ? null : new Date(venc.getTime() + pagaEm * DIA);
      const pagou = !!diaPag && diaPag.getTime() < hoje.getTime();
      const limite = pagou ? diaPag! : hoje; // toques acontecem até pagar (ou até hoje)
      const diasAtrasoFim = Math.round((limite.getTime() - venc.getTime()) / DIA);

      // Contato manual da operadora da carteira (uma ou duas vezes no período em atraso).
      const toques: Toque[] = [];
      const cartAtual = carteiraDaFaixa(diasAtrasoFim, [c1, c2]);
      if (cartAtual && rnd() < 0.62) {
        const op = donoDe(cliente.id, cartAtual.id);
        // Se pagou, o contato manual costuma vir 0–3 dias antes do pagamento.
        const offset = pagou ? diasAtrasoFim - entre(0, 3) : entre(cartAtual.diaMinimo, Math.max(cartAtual.diaMinimo, diasAtrasoFim - 1));
        if (offset >= cartAtual.diaMinimo && offset <= diasAtrasoFim) {
          const dataToque = horario(new Date(venc.getTime() + offset * DIA), 9, 17);
          if (dataToque < (pagou ? horario(diaPag!, 18, 18) : agora)) {
            // Parte das conversas acontece direto no chat do NX (registrada pelo webhook — item 7).
            const chat = rnd() < 0.35;
            toques.push({
              data: dataToque, origem: 'MANUAL', canal: 'NX_SYSTEMS', contaId: linhaDaCarteira[cartAtual.id], userId: op, chat,
              texto: chat
                ? `Oi ${nome.split(' ')[0]}, tudo bem? Conseguimos combinar o pagamento da fatura de ${brl(plano.valor)} hoje?`
                : `Olá ${nome.split(' ')[0]}, aqui é da Microrcim. Vi que a fatura de ${brl(plano.valor)} está em aberto — posso te ajudar a regularizar hoje?`,
            });
            if (rnd() < 0.35) {
              notas.push({
                tenantId: TENANT_ID, customerId: cliente.id, userId: op, tipo: 'PROMESSA',
                texto: 'Cliente informou que paga até o fim da semana.',
                dataPromessa: new Date(dataToque.getTime() + entre(1, 5) * DIA), valorPrometido: plano.valor,
                createdAt: new Date(dataToque.getTime() + 15 * 60_000),
              });
            }
          }
        }
      }
      // Régua: cada passo cujo dia chegou antes do pagamento.
      for (const p of regua.passos) {
        const dia = new Date(venc.getTime() + p.offsetDias * DIA);
        const quando = horario(dia, 9, 11);
        if (quando >= (pagou ? horario(diaPag!, 8, 8) : agora)) continue;
        if (p.canal === 'EMAIL' && !cliente.email) continue;
        toques.push({ data: quando, origem: 'REGUA', canal: p.canal, contaId: p.channelAccountId, texto: p.template, passo: p.offsetDias });
      }

      const status = pagou ? 'PAGA' : venc < hoje ? 'VENCIDA' : 'PENDENTE';
      const pagoEm = pagou ? horario(diaPag!, 8, 20) : null;
      const inv = await prisma.invoice.create({
        data: {
          tenantId: TENANT_ID, customerId: cliente.id, valor: plano.valor, vencimento: venc, status, pagoEm,
          descricao: `Mensalidade ${plano.nome}`, metodo: 'PIX', pixCopiaCola: '00020126-DEMO-PIX',
          linkPagamento: 'https://demo.invalid/pagar', origem: 'demo',
          createdAt: new Date(venc.getTime() - 10 * DIA),
        },
      });
      for (const t of toques) {
        const falhou = t.origem === 'REGUA' && rnd() < 0.03;
        dispatches.push({
          tenantId: TENANT_ID, customerId: cliente.id, invoiceId: inv.id, channelAccountId: t.contaId,
          ruleId: t.chat ? null : regua.id, ruleNome: t.chat ? null : regua.nome, origem: t.origem, userId: t.userId ?? null,
          canal: t.canal, cadeiaCanais: [t.canal], template: t.chat ? 'nx_chat' : t.texto,
          stepId: t.chat ? `nxchat:${t.contaId}:${inv.id}:${t.data.toISOString().slice(0, 10)}` : null,
          conteudo: t.texto.replace('{{nome}}', nome.split(' ')[0]).replace(/\{\{valor\}\}/g, brl(plano.valor))
            .replace('{{vencimento}}', venc.toLocaleDateString('pt-BR', { timeZone: 'UTC' })).replace(/\{\{(pix|link)\}\}/g, '(link de pagamento)'),
          status: falhou ? 'FALHA' : 'ENVIADO', erro: falhou ? 'Número sem WhatsApp' : null,
          agendadoPara: t.data, enviadoEm: falhou ? null : t.data, createdAt: t.data,
        });
      }
      if (pagou) pagas.push({ id: inv.id, customerId: cliente.id, pagoEm: pagoEm!, diasAtraso: Math.max(0, pagaEm!) });
    }
  }

  for (let i = 0; i < dispatches.length; i += 2000) {
    await prisma.messageDispatch.createMany({ data: dispatches.slice(i, i + 2000) as never });
  }
  await prisma.customerNote.createMany({ data: notas as never });

  // ---------------- Atribuição (mesmo serviço da aplicação) ----------------
  // O crédito é da responsável no momento do pagamento: em ordem cronológica,
  // define a responsável pela carteira do atraso daquele pagamento e atribui.
  const atrib = new AtribuicaoService(prisma as never);
  pagas.sort((a, b) => a.pagoEm.getTime() - b.pagoEm.getTime());
  const donoPorCliente = new Map<string, string>();
  for (const p of pagas) {
    const cart = carteiraDaFaixa(p.diasAtraso, [c1, c2]);
    if (cart) {
      const resp = donoDe(p.customerId, cart.id);
      if (donoPorCliente.get(p.customerId) !== resp) {
        await prisma.customer.update({ where: { id: p.customerId }, data: { responsavelId: resp } });
        donoPorCliente.set(p.customerId, resp);
      }
    }
    await atrib.atribuirFaturas(TENANT_ID, [p.id]);
  }
  // ---------------- Risco (mesmo cálculo da aplicação: últimas cobranças pagas) ----------------
  const risco = new RiskScoringService(prisma as never);
  for (const c of await prisma.customer.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } })) {
    await risco.scoreCustomer(TENANT_ID, c.id);
  }

  // ---------------- Promessas em vigor: régua pausada até a data ----------------
  // Alguns clientes com fatura vencida prometeram pagar nos próximos dias.
  const prometeram = await prisma.customer.findMany({
    where: { tenantId: TENANT_ID, invoices: { some: { status: 'VENCIDA' } } },
    select: { id: true, responsavelId: true }, take: 12, skip: 40,
  });
  for (const [k, c] of prometeram.entries()) {
    const ate = new Date(hoje.getTime() + (1 + (k % 5)) * DIA);
    await prisma.customer.update({ where: { id: c.id }, data: { promessaAte: ate } });
    await prisma.customerNote.create({
      data: {
        tenantId: TENANT_ID, customerId: c.id, userId: c.responsavelId ?? lais.id, tipo: 'PROMESSA',
        texto: `Cliente prometeu pagar até ${ate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`, dataPromessa: ate,
        createdAt: new Date(agora.getTime() - 2 * 3_600_000),
      },
    });
  }

  // ---------------- Distribuição automática dos vencidos de hoje ----------------
  const dist = await new DistribuicaoService(prisma as never).distribuirTenant(TENANT_ID);

  // ---------------- Exemplos de transferência de fila no NX (item 6) ----------------
  const respondendo = await prisma.customer.findMany({
    where: { tenantId: TENANT_ID, responsavelId: { not: null }, invoices: { some: { status: 'VENCIDA' } } },
    select: { id: true, responsavelId: true }, take: 25,
  });
  const usuarios = new Map((await prisma.user.findMany({ where: { tenantId: TENANT_ID }, select: { id: true, nxQueueId: true, carteiraId: true } })).map((u) => [u.id, u]));
  await prisma.nxTicketRoute.createMany({
    data: respondendo.map((c, k) => {
      const u = usuarios.get(c.responsavelId!)!;
      return {
        tenantId: TENANT_ID, channelAccountId: u.carteiraId === c2.id ? l3000.id : l2000.id, ticketId: String(5000 + k),
        queueId: u.nxQueueId ?? 10, customerId: c.id, responsavelId: u.id, motivo: 'responsavel',
        createdAt: new Date(agora.getTime() - entre(1, 72) * 3_600_000),
      };
    }),
  });

  const [nClientes, nFaturas, nDisp, nManuais, abertas] = await Promise.all([
    prisma.customer.count({ where: { tenantId: TENANT_ID } }),
    prisma.invoice.count({ where: { tenantId: TENANT_ID } }),
    prisma.messageDispatch.count({ where: { tenantId: TENANT_ID } }),
    prisma.messageDispatch.count({ where: { tenantId: TENANT_ID, origem: 'MANUAL' } }),
    prisma.invoice.count({ where: { tenantId: TENANT_ID, status: 'VENCIDA' } }),
  ]);
  // eslint-disable-next-line no-console
  console.log(`Demo Microrcim pronta: ${nClientes} clientes, ${nFaturas} faturas (${abertas} vencidas em aberto), ${nDisp} disparos (${nManuais} manuais), ${pagas.length} pagamentos atribuídos.`);
  for (const c of dist) {
    // eslint-disable-next-line no-console
    console.log(`  ${c.carteira}: ${c.clientes} clientes vencidos — ${c.operadores.map((o) => `${o.nome}: ${o.clientes}`).join(', ')}`);
  }
  // eslint-disable-next-line no-console
  console.log('Login: antonio@microrcim.demo / recorra123');
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
