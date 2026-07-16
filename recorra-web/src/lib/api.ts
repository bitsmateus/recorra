const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'recorra_token';
const REFRESH_KEY = 'recorra_refresh';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setToken(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
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
 * O access token dura 15 min; o refresh, 30 dias. Renovar em vez de deslogar.
 *
 * O /auth/refresh ROTACIONA: ele revoga o token usado e emite outro. Se duas chamadas
 * paralelas tomarem 401 e cada uma renovar por conta própria, a primeira invalida o
 * token da segunda e a sessão cai — justamente o que queremos evitar. Por isso todas
 * compartilham a mesma promessa de renovação.
 */
let renovando: Promise<string | null> | null = null;

async function renovarToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return null;
    setToken(data.accessToken, data.refreshToken);
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
  return fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
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

/** Encerra a sessão: revoga o refresh no servidor antes de limpar o navegador. */
export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  clearToken();
}
