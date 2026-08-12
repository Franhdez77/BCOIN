import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../domain/auth.constants';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

