import axios from 'axios';

/**
 * Cliente do Graph da Meta para templates (HSM).
 *
 * Um template NÃO é um registro nosso: ele vive na Meta, passa por revisão e só
 * pode ser enviado depois de aprovado. Por isso criar/editar/excluir aqui fala com
 * a Meta — a tabela local é só um espelho, atualizado pela sincronização.
 * Docs: developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */

/** Acesso a uma WABA: de onde tirar o token e em qual conta escrever. */
export interface AcessoGraph {
  wabaId: string;
  token: string;
  versao: string; // ex.: "21.0"
  origem: string; // apelido do canal, para o usuário saber de onde veio
}

export interface ComponenteMeta {
  type?: string;
  text?: string;
  format?: string;
  buttons?: { type?: string; text?: string; url?: string; phone_number?: string }[];
}

/** Botão de template normalizado para o Recorrai (espelho da Meta). */
export interface BotaoTemplate {
  tipo: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OUTRO';
  texto: string;
  url?: string;
  telefone?: string;
  /** Posição do botão na lista — é o `index` que o envio da Meta exige. */
  index: number;
  /**
   * true quando o botão precisa de um valor no envio (varia por cliente):
   *  - URL com `{{n}}` na URL (só o sufixo é dinâmico; a base é fixa no template)
   *  - COPY_CODE (o código a copiar, ex.: Pix copia-e-cola)
   * QUICK_REPLY, telefone e URL fixa NÃO são dinâmicos.
   */
  dinamico: boolean;
}

/** Extrai os botões (do componente BUTTONS) para exibir/guardar. */
export function botoesDeComponents(components?: ComponenteMeta[]): BotaoTemplate[] {
  const bloco = (components || []).find((c) => (c.type || '').toUpperCase() === 'BUTTONS');
  return (bloco?.buttons || []).map((b, index) => {
    const t = (b.type || '').toUpperCase();
    const tipo = (['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE'].includes(t) ? t : 'OUTRO') as BotaoTemplate['tipo'];
    const urlDinamica = tipo === 'URL' && !!b.url && /\{\{\s*\d+\s*\}\}/.test(b.url);
    return {
      tipo,
      texto: b.text ?? '',
      index,
      dinamico: tipo === 'COPY_CODE' || urlDinamica,
      ...(b.url ? { url: b.url } : {}),
      ...(b.phone_number ? { telefone: b.phone_number } : {}),
    };
  });
}

/** Só os botões que exigem um valor por cliente no envio (URL dinâmica / copiar código). */
export function botoesDinamicos(botoes?: BotaoTemplate[] | null): BotaoTemplate[] {
  return (botoes ?? []).filter((b) => b.dinamico);
}

/** Botão a criar num template novo (o que vem da tela "Novo template"). */
export interface BotaoCriacao {
  tipo: 'QUICK_REPLY' | 'URL' | 'COPY_CODE';
  texto?: string; // rótulo (QUICK_REPLY / URL); a Meta limita a 25 caracteres
  urlBase?: string; // URL: base fixa (ex.: https://www.asaas.com/i/)
  dinamica?: boolean; // URL: acrescenta {{1}} — o valor muda por cliente
  exemplo?: string; // valor de exemplo do sufixo/código (a Meta exige na revisão)
}

/**
 * Monta o componente BUTTONS para CRIAR o template na Meta. A Meta exige `example`
 * na URL dinâmica e no COPY_CODE (o revisor precisa ver preenchido). null = sem botões.
 */
export function componenteBotoesCriacao(botoes?: BotaoCriacao[]): Record<string, unknown> | null {
  const bs = (botoes ?? []).filter((b) => b && b.tipo);
  if (!bs.length) return null;
  const buttons = bs.map((b) => {
    const texto = (b.texto || '').trim().slice(0, 25);
    if (b.tipo === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: texto || 'Responder' };
    if (b.tipo === 'COPY_CODE') {
      // A Meta exige o example como STRING (não array) e o botão de código só
      // aceita um código curto alfanumérico (≤ 15) — não um Pix copia-e-cola longo.
      const ex = (b.exemplo || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 15) || 'PIX12345';
      return { type: 'COPY_CODE', example: ex };
    }
    const base = (b.urlBase || '').trim();
    if (b.dinamica) {
      return { type: 'URL', text: texto || 'Abrir', url: `${base}{{1}}`, example: [`${base}${b.exemplo?.trim() || 'exemplo'}`] };
    }
    return { type: 'URL', text: texto || 'Abrir', url: base };
  });
  return { type: 'BUTTONS', buttons };
}

/**
 * Para uma URL dinâmica `https://base/caminho/{{1}}`, a Meta só aceita o SUFIXO
 * (o que entra no lugar de `{{1}}`), não a URL inteira. Se o valor mapeado já é a
 * URL completa e começa com a base do template, devolvemos só o pedaço final.
 * Sem base identificável, mandamos o valor como veio (melhor esforço).
 */
export function sufixoUrlDinamica(urlTemplate: string | undefined, valor: string): string {
  const v = (valor ?? '').trim();
  if (!urlTemplate) return v;
  const base = urlTemplate.replace(/\{\{\s*\d+\s*\}\}.*$/, ''); // tudo antes do {{n}}
  if (base && v.startsWith(base)) return v.slice(base.length);
  return v;
}

/** Mapeamento de um botão dinâmico do passo/campanha (o que preenche cada botão). */
export interface BotaoMapeado {
  index: number;
  subType: 'url' | 'copy_code';
  token: string; // variável Recorra, ex.: "{{link}}", "{{pix}}"
  urlBase?: string; // base fixa da URL do template (para extrair o sufixo dinâmico)
}

/** Parâmetro de botão já resolvido (valor final do cliente), pronto para o envio. */
export interface BotaoParamResolvido {
  index: number;
  subType: 'url' | 'copy_code';
  text: string;
}

/**
 * Resolve o mapeamento dos botões em parâmetros de envio, usando `render` para
 * trocar o token pela variável do cliente. Na URL dinâmica, manda só o sufixo.
 */
export function resolverBotoesParaEnvio(
  mapeados: BotaoMapeado[] | null | undefined,
  render: (token: string) => string,
): BotaoParamResolvido[] {
  return (mapeados ?? [])
    .filter((m) => m.token && m.token.trim())
    .map((m) => {
      const valor = render(m.token);
      return { index: m.index, subType: m.subType, text: m.subType === 'url' ? sufixoUrlDinamica(m.urlBase, valor) : valor };
    });
}

/**
 * Componentes de botão para o envio do template na Meta (Cloud API / NX WABA),
 * a partir dos parâmetros já resolvidos por cliente. Botão com valor vazio é
 * omitido — a Meta recusa parâmetro em branco.
 */
export function botoesComponents(resolvidos?: BotaoParamResolvido[] | null): Record<string, unknown>[] {
  return (resolvidos ?? [])
    .filter((b) => b.text && b.text.trim())
    .map((b) => ({
      type: 'button',
      sub_type: b.subType,
      index: String(b.index),
      parameters: b.subType === 'copy_code'
        ? [{ type: 'coupon_code', coupon_code: b.text }]
        : [{ type: 'text', text: b.text }],
    }));
}

export interface TemplateMeta {
  id: string;
  name: string;
  language?: string;
  category?: string;
  status?: string;
  components?: ComponenteMeta[];
}

const TIMEOUT = 20000;

function url(a: AcessoGraph, path: string): string {
  return `https://graph.facebook.com/v${a.versao.replace(/^v/i, '')}/${path}`;
}

/** Traduz o erro da Meta para algo que o usuário entenda, sem esconder o original. */
export function erroMeta(e: unknown): string {
  if (!axios.isAxiosError(e)) return String(e);
  const err = (e.response?.data as { error?: { message?: string; error_user_msg?: string; code?: number } })?.error;
  if (!err) return e.message;
  const msg = err.error_user_msg || err.message || 'erro na Meta';
  if (err.code === 190) return `Token sem acesso ao Business Manager (${msg}). Sincronize os canais e tente de novo.`;
  if (err.code === 200 || err.code === 10) return `Sem permissão para gerenciar templates nesta conta (${msg}).`;
  return msg;
}

/** Nome exigido pela Meta: minúsculas, números e underscore. */
export function nomeValidoMeta(nome: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(nome);
}

/** Sugere um nome válido a partir de um texto livre. */
export function sugerirNome(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Posições das variáveis do corpo, na ordem: "{{1}} {{2}}" → [1, 2]. */
export function variaveisDoCorpo(corpo: string): number[] {
  const out = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo || ''))) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

/** Lista os templates da WABA, seguindo a paginação. */
export async function listarTemplates(a: AcessoGraph): Promise<TemplateMeta[]> {
  const out: TemplateMeta[] = [];
  let proxima: string | null = url(a, `${a.wabaId}/message_templates`);
  let params: Record<string, unknown> | undefined = {
    fields: 'name,status,category,language,components',
    limit: 100,
    access_token: a.token,
  };
  let guard = 0;
  while (proxima && guard++ < 20) {
    const resp: { data: { data?: TemplateMeta[]; paging?: { next?: string } } } = await axios.get(proxima, { params, timeout: TIMEOUT });
    out.push(...(resp.data.data ?? []));
    proxima = resp.data.paging?.next ?? null; // 'next' já traz a querystring completa
    params = undefined;
  }
  return out;
}

/**
 * Cria o template na Meta. Ele nasce em revisão (PENDING) — só dá para enviar
 * depois de aprovado. `exemplos` é obrigatório quando o corpo tem variáveis: a
 * Meta recusa a criação sem eles, porque o revisor precisa ver o texto preenchido.
 */
export async function criarTemplate(
  a: AcessoGraph,
  dto: { nome: string; idioma: string; categoria: string; corpo: string; exemplos?: string[]; botoes?: BotaoCriacao[] },
): Promise<{ id: string; status?: string; category?: string }> {
  const vars = variaveisDoCorpo(dto.corpo);
  const compBotoes = componenteBotoesCriacao(dto.botoes);
  const body: Record<string, unknown> = {
    name: dto.nome,
    language: dto.idioma,
    category: dto.categoria,
    components: [
      {
        type: 'BODY',
        text: dto.corpo,
        ...(vars.length ? { example: { body_text: [vars.map((n) => dto.exemplos?.[n - 1] || `exemplo ${n}`)] } } : {}),
      },
      ...(compBotoes ? [compBotoes] : []),
    ],
  };
  const { data } = await axios.post(url(a, `${a.wabaId}/message_templates`), body, {
    params: { access_token: a.token },
    timeout: TIMEOUT,
  });
  return data;
}

/**
 * Edita o template na Meta. Nome e idioma são imutáveis — só corpo e categoria.
 * A edição devolve o template para revisão e a Meta limita quantas vezes por mês.
 */
export async function editarTemplate(
  a: AcessoGraph,
  externalId: string,
  dto: { categoria?: string; corpo: string; exemplos?: string[] },
): Promise<{ success?: boolean }> {
  const vars = variaveisDoCorpo(dto.corpo);
  const body: Record<string, unknown> = {
    components: [
      {
        type: 'BODY',
        text: dto.corpo,
        ...(vars.length ? { example: { body_text: [vars.map((n) => dto.exemplos?.[n - 1] || `exemplo ${n}`)] } } : {}),
      },
    ],
    ...(dto.categoria ? { category: dto.categoria } : {}),
  };
  const { data } = await axios.post(url(a, externalId), body, { params: { access_token: a.token }, timeout: TIMEOUT });
  return data;
}

/**
 * Exclui o template na Meta. Sem hsm_id apaga todos os idiomas daquele nome.
 * A Meta bloqueia reutilizar o nome por 30 dias.
 */
export async function excluirTemplate(a: AcessoGraph, nome: string, externalId?: string): Promise<{ success?: boolean }> {
  const { data } = await axios.delete(url(a, `${a.wabaId}/message_templates`), {
    params: { name: nome, ...(externalId ? { hsm_id: externalId } : {}), access_token: a.token },
    timeout: TIMEOUT,
  });
  return data;
}

/** Descobre a WABA a partir do Phone Number ID (evita pedir o WABA ID ao usuário). */
export async function wabaDoPhoneId(phoneId: string, token: string, versao = '21.0'): Promise<string | null> {
  try {
    const { data } = await axios.get(`https://graph.facebook.com/v${versao}/${encodeURIComponent(phoneId)}`, {
      params: { fields: 'whatsapp_business_account{id}', access_token: token },
      timeout: TIMEOUT,
    });
    return (data as { whatsapp_business_account?: { id?: string } })?.whatsapp_business_account?.id ?? null;
  } catch {
    return null;
  }
}
