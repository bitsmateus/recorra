/**
 * Escopos (permissões) dos tokens de API. Fonte única — usada pelo guard, pela
 * validação na criação do token e exposta ao painel para montar os checkboxes.
 *
 * Convenção: `<recurso>:<read|write>`. `write` NÃO implica `read` — cada rota
 * declara o escopo exato que exige via `@Scopes(...)`.
 *
 * `plataforma: true` marca escopos que só um token de PLATAFORMA (superadmin)
 * pode ter — um token de tenant nunca cria/gerencia tenants.
 */
export interface ScopeDef {
  scope: string;
  label: string;
  plataforma?: boolean;
}

export const API_SCOPES: ScopeDef[] = [
  { scope: 'clientes:read', label: 'Clientes — ler' },
  { scope: 'clientes:write', label: 'Clientes — criar/editar/excluir' },
  { scope: 'cobrancas:read', label: 'Cobranças — ler' },
  { scope: 'cobrancas:write', label: 'Cobranças — criar/editar/gerar Pix/boleto' },
  { scope: 'usuarios:read', label: 'Usuários — ler' },
  { scope: 'usuarios:write', label: 'Usuários — criar/editar' },
  { scope: 'tenants:read', label: 'Tenants — ler (plataforma)', plataforma: true },
  { scope: 'tenants:write', label: 'Tenants — criar/editar (plataforma)', plataforma: true },
];

const VALIDOS = new Set(API_SCOPES.map((s) => s.scope));
const PLATAFORMA = new Set(API_SCOPES.filter((s) => s.plataforma).map((s) => s.scope));

export const isScopeValido = (s: string) => VALIDOS.has(s);
export const isScopePlataforma = (s: string) => PLATAFORMA.has(s);

/** Escopos que um token de um dado tipo pode receber. */
export function scopesPermitidos(tipo: 'TENANT' | 'PLATFORM'): string[] {
  return API_SCOPES.filter((s) => (tipo === 'PLATFORM' ? true : !s.plataforma)).map((s) => s.scope);
}
