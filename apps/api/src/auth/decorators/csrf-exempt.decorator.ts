import { SetMetadata } from '@nestjs/common';

import { CSRF_EXEMPT_KEY } from '../domain/auth.constants';

export const CsrfExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CSRF_EXEMPT_KEY, true);
