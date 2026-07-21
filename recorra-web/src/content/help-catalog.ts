export interface HelpTopic {
  id: string;
  section: string;
  title: string;
  summary: string;
  steps: string[];
  rules: string[];
  notes?: string[];
  keywords?: string[];
}

/**
 * Manual funcional oficial do Recorrai.
 *
 * Este catálogo é publicado junto com o frontend e deve refletir o comportamento
 * vigente do produto. Mudanças funcionais precisam atualizar este arquivo ou o
 * changelog da Central de Ajuda; o CI valida essa obrigação por commit.
 */
export const HELP_CATALOG_VERSION = '2026.07.20';
export const HELP_CATALOG_UPDATED_AT = '20/07/2026';

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'primeiros-passos', section: 'Primeiros passos', title: 'Configuração inicial recomendada',
    summary: 'Ordem segura para colocar a operação de cobrança em funcionamento.',
    steps: [
      'Cadastre ou revise os usuários em Configurações > Equipe.',
      'Conecte o ERP e o gateway em Configurações > Integrações.',
      'Conecte pelo menos um canal de comunicação em Canais.',
      'Importe clientes e cobranças escolhendo o período que ficará ativo.',
      'Revise as cobranças classificadas como ativas e legado.',
      'Crie ou clone uma régua, confira cada mensagem e só então ative a automação.',
      'Acompanhe os envios em Disparos e os resultados no Dashboard e Relatórios.',
    ],
    rules: [
      'O Recorrai não substitui o ERP: ele sincroniza cobranças, acompanha pagamentos e executa a comunicação.',
      'Uma cobrança só recebe mensagens automáticas quando está aberta, com gestão ATIVA, não contestada e encontra um passo de régua correspondente ao seu vencimento.',
      'Antes da produção, teste gateway, canal, variáveis das mensagens e permissões da equipe.',
    ],
  },
  {
    id: 'dashboard', section: 'Visão e análises', title: 'Dashboard',
    summary: 'Leitura dos principais números de cobrança e recuperação no período selecionado.',
    steps: ['Escolha o período no topo do Dashboard.', 'Leia inadimplência, recuperado, cobranças ativas e disparos.', 'Use a composição por idade para identificar concentração de vencidas.', 'Abra Relatórios quando precisar de detalhamento ou exportação.'],
    rules: [
      'Inadimplência considera cobranças VENCIDAS e ATIVAS cujo vencimento está dentro do período.',
      'Recuperado considera cobranças PAGAS de acordo com o recorte usado pelo indicador.',
      'Cobranças LEGADO não compõem a inadimplência operacional atual.',
      'Disparos são recortados pela data do envio; faturas são recortadas pela data de vencimento.',
    ],
  },
  {
    id: 'clientes', section: 'Clientes', title: 'Cadastro e gestão de clientes',
    summary: 'Cadastro individual, pesquisa, etiquetas e visão consolidada de cada cliente.',
    steps: ['Abra Cobrança > Clientes.', 'Cadastre manualmente ou use uma importação/integração.', 'Pesquise por nome ou CPF/CNPJ.', 'Use etiquetas para segmentar campanhas.', 'Abra o cliente para consultar cobranças, pagamentos, risco, disparos, acordos e assinaturas.'],
    rules: [
      'CPF/CNPJ identifica o cliente dentro da empresa e evita duplicidade.',
      'Na sincronização, um cliente existente com o mesmo documento é atualizado em vez de duplicado.',
      'Dados de contato incompletos podem impedir o envio pelo canal correspondente.',
      'A exclusão do cliente pode remover dados relacionados; revise o histórico antes de confirmar.',
    ],
  },
  {
    id: 'importacao-planilha', section: 'Clientes', title: 'Importação por Excel ou CSV',
    summary: 'Entrada manual em massa de clientes e, opcionalmente, suas cobranças.',
    steps: ['Baixe o modelo na tela de Cobranças ou abra o Assistente Excel/CSV.', 'Envie o arquivo e associe cada coluna ao campo correto.', 'Revise DDI/DDD, etiquetas e a opção de criar cobranças.', 'Confira a prévia e corrija documentos, e-mails, telefones, valores ou datas inválidas.', 'Confirme a importação e revise o resultado.'],
    rules: [
      'Linhas sem CPF/CNPJ válido não criam cliente.',
      'Cobrança só é criada quando valor e vencimento são válidos.',
      'Vencimento anterior à data atual entra como VENCIDA; os demais entram como PENDENTE.',
      'Importar novamente o mesmo documento atualiza o cliente, mas cobranças de planilha exigem atenção para evitar repetição.',
    ],
  },
  {
    id: 'integracoes-erp', section: 'Integrações', title: 'Integrações com ERP',
    summary: 'Sincronização de clientes e títulos abertos vindos do sistema de gestão.',
    steps: ['Abra Configurações > Integrações.', 'Escolha o ERP disponível e informe URL/token exigidos.', 'Salve e use Testar.', 'Clique em Sincronizar para trazer clientes e cobranças.', 'Revise o resultado nas telas de Clientes e Cobranças.'],
    rules: [
      'A sincronização de clientes deduplica por empresa + documento.',
      'A sincronização de faturas deduplica pelo identificador externo do ERP.',
      'Somente títulos devolvidos pelo conector como abertos são sincronizados.',
      'Remover a integração não apaga automaticamente os clientes e faturas já importados.',
      'As credenciais são armazenadas cifradas e não voltam preenchidas para a interface.',
    ],
  },
  {
    id: 'gateway', section: 'Integrações', title: 'Configurar um gateway de pagamento',
    summary: 'Conexão usada para importar, gerar, cancelar e conciliar cobranças.',
    steps: ['Abra Configurações > Integrações.', 'Na área Gateway de pagamento, escolha provedor e ambiente.', 'Informe as credenciais e, quando disponível, o token de webhook.', 'Salve e clique em Testar.', 'Use a importação de gateway na tela de Cobranças.'],
    rules: [
      'Sandbox e produção são ambientes diferentes; uma chave de um ambiente não funciona necessariamente no outro.',
      'Atualmente a importação geral está disponível quando o provedor implementa essa capacidade, com suporte principal ao Asaas.',
      'O webhook acelera a baixa, e a conciliação periódica funciona como rede de segurança.',
      'Remover a conta do Recorrai não cancela cobranças existentes no provedor.',
    ],
  },
  {
    id: 'importar-gateway', section: 'Cobranças', title: 'Importar cobranças do gateway',
    summary: 'Traz clientes e cobranças abertas, separando operação atual de passivo antigo.',
    steps: ['Abra Cobranças > Importação > Importar do gateway.', 'Escolha qual gateway será consultado.', 'Escolha a janela: hoje, últimos 30, 60, 90 dias ou todas.', 'Aguarde a prévia de quantidade e valor.', 'Confira quantas ficarão ATIVAS e quantas ficarão como LEGADO.', 'Confirme a importação.'],
    rules: [
      'Por padrão, somente cobranças PENDENTES ou VENCIDAS são trazidas na sincronização geral.',
      'Cobranças dentro da janela ficam ATIVAS e podem participar da automação.',
      'Cobranças anteriores à janela ficam como LEGADO: permanecem visíveis e conciliáveis, mas não entram em réguas, campanhas automáticas, risco operacional, total atual em aberto ou geração em lote.',
      'A janela escolhida fica salva no gateway e é reutilizada na sincronização diária.',
      'A reimportação atualiza a cobrança pelo identificador do gateway, sem criar duplicata.',
      'Importar não cria um novo boleto: registra no Recorrai a cobrança que já existe no gateway.',
    ],
  },
  {
    id: 'status-cobranca', section: 'Cobranças', title: 'Status e gestão da cobrança',
    summary: 'Diferença entre a situação financeira e a participação na automação.',
    steps: ['Consulte a coluna Status na tela de Cobranças.', 'Use o botão de ajuda ao lado do cabeçalho para ver a legenda.', 'Observe o selo LEGADO quando existir.', 'Use Reavaliar status se uma pendente já passou do vencimento.'],
    rules: [
      'PENDENTE: criada e ainda no prazo.', 'VENCIDA: passou do vencimento sem confirmação de pagamento.', 'PAGA: pagamento confirmado.', 'CANCELADA: não deve mais ser cobrada.', 'ESTORNADA: pagamento devolvido.',
      'ATIVA, LEGADO e PAUSADA são estados de gestão; não substituem o status financeiro.',
      'Reavaliar status muda PENDENTE para VENCIDA pela data, sem alterar pagas ou canceladas.',
    ],
  },
  {
    id: 'cobranca-manual', section: 'Cobranças', title: 'Gerar cobrança manual',
    summary: 'Criação excepcional de uma nova fatura e, opcionalmente, uma cobrança no gateway.',
    steps: ['Clique em Gerar cobrança manual.', 'Localize e selecione o cliente.', 'Informe valor, vencimento e descrição.', 'Escolha Só registrar ou selecione gateway e método.', 'Confirme e consulte os dados de pagamento na linha criada.'],
    rules: [
      'Só registrar cria a fatura localmente, sem Pix/boleto/link no gateway.',
      'Ao escolher gateway, o Recorrai cria uma nova cobrança real no provedor.',
      'Pix tenta armazenar o código copia e cola; boleto armazena linha/URL; cartão normalmente disponibiliza o fluxo de pagamento do gateway.',
      'Uma cobrança já emitida não permite alterar localmente o valor para evitar divergência com o gateway.',
      'Use a criação manual para exceções; mensalidades normalmente devem ser geradas pelo ERP/gateway e importadas.',
    ],
  },
  {
    id: 'cancelar-excluir', section: 'Cobranças', title: 'Excluir ou cancelar cobranças',
    summary: 'Escolha consciente entre remover apenas o registro local e cancelar no provedor.',
    steps: ['Clique no ícone de excluir da cobrança.', 'Leia se ela já foi gerada no gateway.', 'Escolha remover somente do Recorrai ou cancelar também no gateway, quando oferecido.', 'Confirme e revise a mensagem de resultado.'],
    rules: [
      'Remover somente do Recorrai não cancela boleto, Pix ou link no gateway.',
      'Cancelar no gateway depende de identificador externo, conta vinculada e resposta do provedor.',
      'A exclusão em massa é conservadora e não cancela cobranças no gateway.',
      'Ações relevantes são registradas na auditoria do backend.',
    ],
  },
  {
    id: 'conciliacao', section: 'Cobranças', title: 'Baixa e conciliação de pagamentos',
    summary: 'Atualização automática de cobranças quando o gateway confirma o pagamento.',
    steps: ['Mantenha gateway e webhook configurados.', 'Aguarde a confirmação automática.', 'Use Reavaliar status apenas para vencimento; ele não confirma pagamento.', 'Consulte a cobrança e os disparos após a baixa.'],
    rules: [
      'A conciliação consulta periodicamente cobranças abertas que possuem vínculo com gateway.',
      'Quando o pagamento é confirmado, a fatura passa para PAGA e recebe a data de pagamento.',
      'Mensagens ainda na fila para aquela fatura são ignoradas após a baixa.',
      'Cobranças LEGADO continuam sendo conciliadas, embora não recebam cobrança automática.',
      'O sistema pode enfileirar uma confirmação de pagamento após a baixa.',
    ],
  },
  {
    id: 'reguas', section: 'Automação', title: 'Réguas de cobrança',
    summary: 'Fluxos automáticos disparados em dias específicos antes ou depois do vencimento.',
    steps: ['Abra Comunicação > Réguas.', 'Crie uma régua ou clone um modelo.', 'Defina janela de horário, dias úteis e limite diário.', 'Adicione passos com deslocamento, canal, conta e mensagem.', 'Configure templates oficiais quando o canal exigir.', 'Revise variáveis e ative a régua.'],
    rules: [
      'Offset negativo envia antes do vencimento, zero no vencimento e positivo depois.',
      'O motor exige correspondência exata: um passo D+7 executa quando a fatura completa sete dias de atraso.',
      'Somente faturas PENDENTES/VENCIDAS, ATIVAS e não contestadas são avaliadas.',
      'Opt-out, limite diário, janela de envio e duplicidade diária podem impedir o disparo.',
      'Variáveis disponíveis incluem nome, valor, vencimento, Pix, link e contrato.',
      'Se uma variável obrigatória estiver vazia, especialmente em template oficial, o envio pode falhar ou ser bloqueado.',
      'A faixa de risco pode direcionar clientes para réguas diferentes.',
    ],
  },
  {
    id: 'campanhas', section: 'Automação', title: 'Campanhas',
    summary: 'Comunicações avulsas, recorrentes, lembretes ou fluxos direcionados a um público.',
    steps: ['Abra Comunicação > Campanhas e crie uma campanha.', 'Escolha tipo, canal e conta.', 'Defina público por todos, etiqueta, valor, risco e inclusões/exclusões.', 'Configure mensagem/template e agendamento.', 'Use a prévia de público.', 'Salve, ative ou execute e acompanhe o relatório.'],
    rules: [
      'LEMBRETE usa cobranças abertas ATIVAS do cliente e pode enviar todas ou apenas a mais próxima do vencimento.',
      'Cobranças LEGADO não entram em lembretes comuns.',
      'MENSAGEM só busca uma fatura quando o texto usa variável financeira.',
      'Opt-out do canal é respeitado.',
      'Campanhas podem ser de uma vez, mensais ou sempre ativas conforme configuração.',
      'Templates oficiais precisam estar aprovados e com parâmetros corretamente mapeados.',
    ],
  },
  {
    id: 'canais', section: 'Comunicação', title: 'Conectar canais de envio',
    summary: 'Configuração das contas que efetivamente entregam WhatsApp, e-mail, SMS ou HTTP.',
    steps: ['Abra Comunicação > Canais.', 'Escolha o provedor/canal.', 'Informe credenciais e apelido.', 'Teste ou sincronize quando a opção existir.', 'Selecione essa conta ao configurar réguas e campanhas.'],
    rules: [
      'Cadastrar um canal não envia nada sozinho; ele precisa ser usado por uma régua ou campanha.',
      'WhatsApp oficial normalmente exige template aprovado fora da janela de atendimento.',
      'E-mail depende de endereço válido; WhatsApp/SMS dependem de telefone normalizado.',
      'Fallback pode tentar canais alternativos quando configurado e quando a falha permitir.',
      'Credenciais são cifradas e não são exibidas novamente.',
    ],
  },
  {
    id: 'templates', section: 'Comunicação', title: 'Templates de WhatsApp e modelos de e-mail',
    summary: 'Conteúdo reutilizável usado nas mensagens da operação.',
    steps: ['Abra Templates WhatsApp ou Modelos de e-mail.', 'Crie ou sincronize o modelo.', 'Defina nome, corpo e assunto quando for e-mail.', 'Mapeie variáveis na ordem exigida pelo provedor.', 'Selecione o modelo na régua ou campanha.'],
    rules: [
      'O nome do template oficial deve corresponder ao aprovado no provedor.',
      'Parâmetros posicionais precisam seguir a mesma ordem aprovada.',
      'Variável sem valor pode bloquear template oficial.',
      'Alterar um modelo não altera automaticamente mensagens já enfileiradas, pois o conteúdo pode já ter sido resolvido.',
    ],
  },
  {
    id: 'disparos', section: 'Comunicação', title: 'Disparos e estados de entrega',
    summary: 'Auditoria operacional das mensagens criadas pelo Recorrai.',
    steps: ['Abra Comunicação > Disparos.', 'Filtre por status, canal, conta, campanha ou período.', 'Abra o detalhe para ler conteúdo e erro.', 'Corrija credencial, contato, template ou variável antes de uma nova tentativa.'],
    rules: [
      'FILA significa aguardando o horário e o processamento.', 'ENVIADO significa aceito pelo provedor, não necessariamente lido.', 'ENTREGUE e LIDO dependem de retorno do canal.', 'FALHA significa que não foi possível concluir.', 'IGNORADO significa que uma regra impediu o envio, por exemplo pagamento confirmado.',
      'O worker processa a fila; sem o worker ativo, mensagens permanecem em FILA.',
    ],
  },
  {
    id: 'risco', section: 'Visão e análises', title: 'Risco do cliente',
    summary: 'Classificação baseada no histórico operacional de pagamento e engajamento.',
    steps: ['Abra o detalhe do cliente para consultar score e fatores.', 'Use a faixa de risco em réguas e segmentações.', 'Reavalie após mudanças relevantes no histórico quando houver ação disponível.'],
    rules: [
      'O cálculo considera quantidade de atrasos, atraso médio, proporção de vencidas, tempo de relacionamento e leitura de mensagens.',
      'As faixas são BOM, ATENÇÃO e RISCO.',
      'Cobranças LEGADO não entram no histórico operacional usado para recomputar as características.',
      'O score orienta comunicação; não é decisão de crédito nem garantia de pagamento.',
    ],
  },
  {
    id: 'relatorios', section: 'Visão e análises', title: 'Relatórios e exportações',
    summary: 'Acompanhamento de recuperação, canais, funil e dados financeiros.',
    steps: ['Abra Relatórios.', 'Escolha período e visão.', 'Compare recuperação, custo e desempenho por canal/passo.', 'Exporte faturas em CSV ou Excel quando necessário.'],
    rules: [
      'Relatórios de mensagens usam a data do disparo.',
      'Relatórios financeiros podem usar vencimento ou data de pagamento conforme o indicador.',
      'Exportações sem período podem trazer grande volume e possuem limites de segurança no backend.',
      'O resultado representa os dados sincronizados no Recorrai; divergências devem ser conciliadas com o gateway/ERP.',
    ],
  },
  {
    id: 'equipe', section: 'Administração', title: 'Equipe e permissões',
    summary: 'Controle de usuários e papéis dentro da empresa.',
    steps: ['Abra Configurações > Equipe.', 'Convide ou cadastre o usuário.', 'Escolha o papel adequado.', 'Ative ou desative o acesso quando necessário.'],
    rules: [
      'OWNER possui o maior nível dentro da empresa.',
      'ADMIN administra grande parte da operação; FINANCEIRO atua em cobranças; OPERADOR possui ações operacionais limitadas.',
      'O backend valida papel e empresa em ações protegidas; esconder um botão na interface não é a única proteção.',
      'Cada plano pode limitar a quantidade de usuários.',
    ],
  },
  {
    id: 'plano', section: 'Administração', title: 'Plano, limites e faturamento do Recorrai',
    summary: 'Consulta do plano contratado, consumo e recursos disponíveis.',
    steps: ['Abra Configurações > Plano.', 'Confira clientes, disparos e usuários incluídos.', 'Revise alertas de limite.', 'Solicite mudança de plano quando necessário.'],
    rules: [
      'Recursos podem ser liberados por plano e feature flag.',
      'A geração de cobrança exige que a funcionalidade correspondente esteja habilitada.',
      'Disparos excedentes podem gerar cobrança conforme o plano.',
      'Anomalias de consumo podem ser sinalizadas ou bloqueadas pelas proteções da plataforma.',
    ],
  },
  {
    id: 'acordos-assinaturas', section: 'Recursos financeiros', title: 'Acordos e assinaturas internas',
    summary: 'Recursos adicionais para parcelamento de dívida e recorrência criada pelo próprio Recorrai.',
    steps: ['Em Acordos, selecione o cliente, dívida, desconto e parcelas.', 'Revise vencimentos e acompanhe cada parcela.', 'Em Assinaturas, defina plano, valor, ciclo, método e dia de vencimento.', 'Pause ou cancele quando a recorrência não deve continuar.'],
    rules: [
      'Acordo preserva referência das faturas de origem e cria parcelas conforme a condição negociada.',
      'Assinaturas ATIVAS podem gerar novas cobranças na data prevista; PAUSADA ou CANCELADA não deve gerar.',
      'Falhas de cobrança podem gerar retentativas e levar a assinatura para INADIMPLENTE.',
      'Não confunda assinatura interna com mensalidade já gerada automaticamente no ERP/gateway; use apenas um responsável pela geração para evitar duplicidade.',
    ],
  },
  {
    id: 'inbox-optout', section: 'Comunicação', title: 'Inbox, respostas e opt-out',
    summary: 'Tratamento de mensagens recebidas e preferências de comunicação.',
    steps: ['Abra Inbox para consultar conversas.', 'Leia o histórico e responda quando o canal permitir.', 'Resolva a conversa quando o atendimento terminar.', 'Respeite pedidos de parada e consentimentos revogados.'],
    rules: [
      'Respostas recebidas são vinculadas ao cliente/conversa quando a assinatura e a origem são válidas.',
      'Opt-out revogado impede novos envios automáticos naquele canal.',
      'A janela de atendimento do WhatsApp pode permitir mensagem livre; fora dela, o canal oficial normalmente exige template.',
      'Dados pessoais e conteúdo de cobrança devem ser tratados conforme a finalidade e as políticas da empresa.',
    ],
  },
  {
    id: 'cache-menu', section: 'Administração', title: 'Menu lateral e limpeza de cache',
    summary: 'Preferências locais de navegação e recuperação da interface.',
    steps: ['Use o ícone no cabeçalho lateral para minimizar.', 'No modo compacto, passe o mouse nos ícones para ver os nomes.', 'Use o botão inferior para expandir novamente.', 'Clique em Limpar cache quando a interface exibir informação visual antiga.'],
    rules: [
      'A preferência de menu minimizado fica salva no navegador.',
      'Limpar cache remove preferências, sessão temporária e Cache Storage da aplicação.',
      'A limpeza preserva os tokens da sessão atual e recarrega a página.',
      'Limpar cache não altera dados do servidor, clientes, cobranças ou configurações da empresa.',
    ],
  },
];

export const HELP_SECTIONS = [...new Set(HELP_TOPICS.map((topic) => topic.section))];
