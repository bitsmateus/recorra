import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Seed inicial: tenant demo + usuário OWNER + réguas por faixa de risco.
 * Rode com: npm run prisma:seed
 */
async function main() {
  const senhaHash = await argon2.hash('recorra123', { type: argon2.argon2id });

  // Superadmin de plataforma (você, dono do SaaS)
  await prisma.platformAdmin.upsert({
    where: { email: 'super@recorra.com.br' },
    update: {},
    create: { nome: 'Super Admin', email: 'super@recorra.com.br', senhaHash },
  });

  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: {
      id: 'demo-tenant',
      nome: 'Provedor Demo',
      plano: 'PROFISSIONAL',
      users: {
        create: { nome: 'Admin Demo', email: 'admin@demo.com', senhaHash, role: 'OWNER', emailVerify: true },
      },
    },
  });

  // Régua BOM pagador — toque leve
  await criarRegua(tenant.id, 'Bom pagador (leve)', 'BOM', [
    { ordem: 1, offsetDias: 0, canal: 'WHATSAPP_CLOUD', template: 'Oi {{nome}}! Passando pra lembrar que sua fatura de {{valor}} vence hoje ({{vencimento}}). Pix: {{pix}} 🙂' },
  ]);

  // Régua ATENÇÃO — padrão
  await criarRegua(tenant.id, 'Atenção (padrão)', 'ATENCAO', [
    { ordem: 1, offsetDias: -3, canal: 'WHATSAPP_CLOUD', template: 'Olá {{nome}}, sua fatura de {{valor}} vence em 3 dias ({{vencimento}}). Pague pelo Pix: {{pix}}' },
    { ordem: 2, offsetDias: 0, canal: 'WHATSAPP_CLOUD', template: '{{nome}}, hoje é o vencimento da sua fatura de {{valor}}. Pix: {{pix}}' },
    { ordem: 3, offsetDias: 3, canal: 'WHATSAPP_CLOUD', template: '{{nome}}, sua fatura de {{valor}} venceu em {{vencimento}}. Regularize pelo Pix: {{pix}}' },
  ]);

  // Régua RISCO — firme e multicanal
  await criarRegua(tenant.id, 'Risco (firme)', 'RISCO', [
    { ordem: 1, offsetDias: -5, canal: 'WHATSAPP_CLOUD', template: 'Olá {{nome}}, sua fatura de {{valor}} vence em {{vencimento}}. Garanta já o pagamento pelo Pix: {{pix}}' },
    { ordem: 2, offsetDias: 0, canal: 'WHATSAPP_CLOUD', template: '{{nome}}, vence hoje sua fatura de {{valor}}. Evite o bloqueio pagando pelo Pix: {{pix}}' },
    { ordem: 3, offsetDias: 2, canal: 'WHATSAPP_CLOUD', template: '{{nome}}, sua fatura de {{valor}} está vencida. Pix: {{pix}}' },
    { ordem: 4, offsetDias: 5, canal: 'EMAIL', template: '{{nome}}, consta em aberto a fatura de {{valor}} vencida em {{vencimento}}. Link para pagamento: {{link}}' },
    { ordem: 5, offsetDias: 7, canal: 'WHATSAPP_CLOUD', template: '{{nome}}, para evitar o bloqueio do serviço, regularize sua fatura de {{valor}} hoje. Pix: {{pix}}' },
  ]);
  // Tutoriais da Central de Ajuda (exemplos)
  const jaTem = await prisma.tutorial.count();
  if (jaTem === 0) {
    await prisma.tutorial.createMany({
      data: [
        { secao: "geral", titulo: "Bem-vindo ao Recorra", tipo: "TEXTO", ordem: 1, conteudo: "Este e o primeiro passo. Aqui voce configura seus canais, importa clientes e cria sua regua de cobranca. Siga os tutoriais desta pagina na ordem." },
        { secao: "canais", titulo: "Como conectar o WhatsApp", tipo: "TEXTO", ordem: 1, conteudo: "Va em Configuracoes > Canais, escolha o tipo de WhatsApp (oficial ou Evolution) e cole as credenciais. Recomendamos usar o NUMERO DA SUA EMPRESA." },
        { secao: "clientes", titulo: "Importando clientes via CSV", tipo: "TEXTO", ordem: 1, conteudo: "Em Clientes > Importar CSV, use o cabecalho: nome,cpfCnpj,email,telefone,contrato,plano,valor,vencimento,cidade,uf" },
        { secao: "reguas", titulo: "Montando sua primeira regua", tipo: "TEXTO", ordem: 1, conteudo: "Em Reguas, clone um modelo por nicho e ajuste os passos: quando enviar (antes/no dia/depois) e por qual canal." },
      ],
    });
  }


  // Catálogo de planos (faixas públicas do site). Só semeia se a tabela estiver vazia,
  // para não sobrescrever o que o superadmin editar depois.
  const jaTemPlano = await prisma.plan.count();
  if (jaTemPlano === 0) {
    const COBRANCA = ['cobranca', 'ia_risco', 'reguas_por_risco', 'multi_gateway', 'api_ingestao'];
    await prisma.plan.createMany({
      data: [
        { nome: 'Até 300 clientes', preco: 297, maxClientes: 300, disparosInclusos: 1500, custoExcedente: 0.1, maxUsuarios: 3, features: COBRANCA, ordem: 1 },
        { nome: 'Até 1.000 clientes', preco: 497, maxClientes: 1000, disparosInclusos: 5000, custoExcedente: 0.09, maxUsuarios: 5, features: COBRANCA, ordem: 2 },
        { nome: 'Até 2.500 clientes', preco: 797, maxClientes: 2500, disparosInclusos: 12000, custoExcedente: 0.08, maxUsuarios: 10, features: COBRANCA, ordem: 3 },
        { nome: 'Até 5.000 clientes', preco: 1297, maxClientes: 5000, disparosInclusos: 25000, custoExcedente: 0.07, maxUsuarios: 15, features: COBRANCA, ordem: 4 },
        { nome: 'Acima disso', preco: 0, sobConsulta: true, maxClientes: -1, disparosInclusos: 0, custoExcedente: 0.07, maxUsuarios: -1, features: COBRANCA, ordem: 5 },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('✅ Seed concluído.');
  // eslint-disable-next-line no-console
  console.log('   Tenant:     admin@demo.com / recorra123');
  // eslint-disable-next-line no-console
  console.log('   Superadmin: super@recorra.com.br / recorra123');
}

async function criarRegua(
  tenantId: string,
  nome: string,
  faixa: 'BOM' | 'ATENCAO' | 'RISCO',
  steps: { ordem: number; offsetDias: number; canal: any; template: string }[],
) {
  const existing = await prisma.dunningRule.findFirst({ where: { tenantId, nome } });
  if (existing) return;
  await prisma.dunningRule.create({
    data: {
      tenantId,
      nome,
      faixaRisco: faixa,
      steps: { create: steps },
    },
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
