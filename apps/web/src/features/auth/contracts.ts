export interface AuthUser {
  id: string;
  createdAt: string;
  email: string;
  emailVerified: boolean;
  role: string;
  status: string;
  username: string;
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthResult {
  user: AuthUser;
  csrfToken: string;
  accessExpiresAt?: string;
}
