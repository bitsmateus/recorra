import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe uma rota aos papéis informados. Ex.: @Roles('OWNER', 'ADMIN') */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
