import type { UserRole, UserStatus } from '../../generated/prisma/enums';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  role: UserRole;
  email: string;
  username: string;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}
