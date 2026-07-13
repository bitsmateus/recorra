const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const ADMIN_TOKEN_KEY = 'recorra_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
export function setAdminToken(t: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, t);
}
export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

interface Opts {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function adminApi<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    clearAdminToken();
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
    throw new Error('Não autorizado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || 'Erro');
  return data as T;
}
