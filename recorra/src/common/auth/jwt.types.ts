import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
}
