import { SetMetadata } from '@nestjs/common';

import { RATE_LIMIT_POLICY_KEY } from '../domain/auth.constants';

export type RateLimitPolicy =
  'login' | 'register' | 'refresh' | 'passwordRecovery' | 'passwordReset' | 'emailVerification';

export const RateLimit = (policy: RateLimitPolicy): MethodDecorator =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
