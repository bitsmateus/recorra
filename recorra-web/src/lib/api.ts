const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'recorra_token';
const LEGACY_REFRESH_KEY = 'recorra_refresh'; // legado: refresh agora é cookie httpOnly

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  // Refresh token agora vive num cookie httpOnly (setado pelo servidor). Limpa
  // qualquer resquício do modelo antigo em localStorage.
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

function paraLogin(): never {
  clearToken();
  if (typeof window !== 'undefined') window.location.href = '/login';
  throw new Error('Não autorizado');
}

/**
 * O access token dura 15 min; o refresh, 30 dias, e vive num cookie httpOnly —
 * o JS não o enxerga; ele viaja sozinho na chamada de refresh (credentials).
 *
 * O /auth/refresh ROTACIONA: revoga o token usado e emite outro. Se duas chamadas
 * paralelas tomarem 401 e cada uma renovar, a primeira invalida o token da segunda
 * e a sessão cai. Por isso todas compartilham a mesma promessa de renovação.
 */
let renovando: Promise<string | null> | null = null;

async function renovarToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // envia o cookie httpOnly do refresh
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    if (!data.accessToken) return null;
    setToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null; // rede fora: trata como sessão não renovada
  }
}

function renovarUmaVez(): Promise<string | null> {
  if (!renovando) renovando = renovarToken().finally(() => { renovando = null; });
  return renovando;
}

async function requisitar(path: string, method: string, body: unknown, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // credentials: para o cookie httpOnly do refresh ser setado (login) e enviado
  // (refresh). Em outras rotas é inócuo — o cookie tem path /api/auth.
  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;

  let res = await requisitar(path, method, body, auth ? getToken() : null);

  // 401 numa chamada autenticada = token expirado: renova e repete uma única vez.
  // Num login/refresh (auth: false) o 401 é credencial errada — deixa o erro subir
  // com a mensagem do servidor em vez de redirecionar.
  if (res.status === 401 && auth) {
    if (!path.startsWith('/auth/')) {
      const novo = await renovarUmaVez();
      if (!novo) paraLogin();
      res = await requisitar(path, method, body, novo);
    }
    if (res.status === 401) paraLogin();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || 'Erro na requisição');
  }
  return data as T;
}

/** Encerra a sessão: revoga o refresh no servidor (via cookie) e limpa o navegador. */
export async function logout() {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  }).catch(() => undefined);
  clearToken();
}
