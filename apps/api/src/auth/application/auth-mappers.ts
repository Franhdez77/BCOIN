import type { UserRole, UserStatus } from '../../generated/prisma/enums';
import type { PublicUser } from '../domain/auth.types';

export interface PublicUserSource {
  id: string;
  email: string;
  username: string;
  emailVerifiedAt: Date | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export function normalizeEmail(value: string): { display: string; normalized: string } {
  const display = value.trim().normalize('NFC');
  return { display, normalized: display.toLowerCase() };
}

export function normalizeUsername(value: string): { display: string; normalized: string } {
  const display = value.trim().normalize('NFC');
  return { display, normalized: display.normalize('NFKC').toLowerCase() };
}
