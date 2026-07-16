/**
 * Biblioteca inicial de modelos de e-mail. Serve como ponto de partida: ao abrir
 * "Modelos de e-mail" pela primeira vez, o tenant pode importar estes e editar à
 * vontade. Depois de importados viram linhas em email_templates — mexer aqui NÃO
 * altera o que já foi importado.
 *
 * O layout (cabeçalho/botão/rodapé) não vem daqui — ver email-layout.ts.
 *
 * Convenção dos textos: o {{link}} vai SOZINHO na última linha. O layout o
 * transforma no botão do fim do e-mail e tira a URL crua do corpo, então as frases
 * falam em "botão abaixo" e nada vem depois dele.
 */
export interface ModeloEmail {
  id: string;
  nome: string;
  assunto: string;
  corpo: string;
}

export const MODELOS_EMAIL: ModeloEmail[] = [
  {
    id: 'lembrete-antes',
    nome: 'Lembrete antes do vencimento',
    assunto: '{{nome}}, sua fatura vence em {{vencimento}}',
    corpo:
      'Olá {{nome}}, tudo bem?\n\n' +
      'Passando para lembrar que sua fatura de {{valor}} vence em {{vencimento}}.\n\n' +
      'Dá para pagar em menos de um minuto no botão abaixo. Se já pagou, é só ignorar este e-mail.\n\n' +
      '{{link}}',
  },
  {
    id: 'vence-hoje',
    nome: 'Vence hoje',
    assunto: '{{nome}}, sua fatura de {{valor}} vence hoje',
    corpo:
      'Olá {{nome}},\n\n' +
      'Sua fatura de {{valor}} vence hoje ({{vencimento}}).\n\n' +
      'Para evitar juros, pague ainda hoje no botão abaixo. Qualquer dúvida, é só responder este e-mail.\n\n' +
      '{{link}}',
  },
  {
    id: 'atraso-leve',
    nome: 'Primeiro aviso de atraso',
    assunto: 'Pendência em aberto — fatura de {{valor}}',
    corpo:
      'Olá {{nome}},\n\n' +
      'Identificamos que a fatura de {{valor}}, com vencimento em {{vencimento}}, ainda consta em aberto.\n\n' +
      'Se foi esquecimento, dá para regularizar agora no botão abaixo. Se já pagou nos últimos dias, desconsidere este aviso.\n\n' +
      '{{link}}',
  },
  {
    id: 'atraso-firme',
    nome: 'Cobrança firme',
    assunto: '{{nome}}, sua fatura está vencida há alguns dias',
    corpo:
      '{{nome}},\n\n' +
      'A fatura de {{valor}} venceu em {{vencimento}} e segue em aberto.\n\n' +
      'Pedimos que regularize o quanto antes para evitar encargos e a suspensão do serviço. Se precisar negociar, responda este e-mail que encontramos uma alternativa.\n\n' +
      '{{link}}',
  },
  {
    id: 'ultimo-aviso',
    nome: 'Último aviso',
    assunto: 'Último aviso — fatura de {{valor}} em aberto',
    corpo:
      '{{nome}},\n\n' +
      'Este é o último aviso sobre a fatura de {{valor}}, vencida em {{vencimento}}.\n\n' +
      'Sem o pagamento, o débito poderá ser encaminhado para as medidas de cobrança previstas em contrato.\n\n' +
      'Regularize no botão abaixo. Se houver algum engano, entre em contato conosco hoje.\n\n' +
      '{{link}}',
  },
  {
    id: 'confirmacao',
    nome: 'Confirmação de pagamento',
    assunto: 'Recebemos seu pagamento, {{nome}}',
    corpo:
      'Olá {{nome}},\n\n' +
      'Confirmamos o recebimento do pagamento de {{valor}}.\n\n' +
      'Obrigado! Não é necessária nenhuma ação da sua parte.',
  },
];
