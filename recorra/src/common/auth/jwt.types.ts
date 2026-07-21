import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  role: UserRole;
  email: string;
  /**
   * Tipo do token. `access` circula no header Authorization; `refresh` só é
   * aceito em POST /auth/refresh. Separa os dois para que um refresh token
   * (30d) não sirva como bearer de acesso. Ausente = token legado (pré-claim).
   */
  kind?: 'access' | 'refresh';
}

export interface AuthUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
}
