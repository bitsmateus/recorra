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
  buttons?: { type?: string; text?: string }[];
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
  dto: { nome: string; idioma: string; categoria: string; corpo: string; exemplos?: string[] },
): Promise<{ id: string; status?: string; category?: string }> {
  const vars = variaveisDoCorpo(dto.corpo);
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
