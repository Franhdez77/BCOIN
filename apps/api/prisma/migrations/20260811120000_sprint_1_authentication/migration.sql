CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');
CREATE TYPE "SessionRevocationReason" AS ENUM (
  'LOGOUT', 'LOGOUT_ALL', 'USER_REVOKED', 'PASSWORD_RESET',
  'REFRESH_REUSE', 'ACCOUNT_DISABLED', 'EXPIRED'
);
CREATE TYPE "SecurityEventType" AS ENUM (
  'REGISTRATION_CREATED', 'EMAIL_VERIFICATION_REQUESTED', 'EMAIL_VERIFIED',
  'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'REFRESH_ROTATED',
  'REFRESH_REUSE_DETECTED', 'LOGOUT', 'LOGOUT_ALL', 'SESSION_REVOKED',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'CSRF_REJECTED',
  'RATE_LIMITED'
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(254) NOT NULL,
  "emailNormalized" VARCHAR(254) NOT NULL,
  "username" VARCHAR(32) NOT NULL,
  "usernameNormalized" VARCHAR(32) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "emailVerifiedAt" TIMESTAMPTZ(3),
  "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_lengths_check" CHECK (
    "email" = btrim("email") AND char_length("email") BETWEEN 3 AND 254
  ),
  CONSTRAINT "users_email_normalized_check" CHECK (
    "emailNormalized" = lower(btrim("emailNormalized"))
    AND char_length("emailNormalized") BETWEEN 3 AND 254
  ),
  CONSTRAINT "users_username_lengths_check" CHECK (
    "username" = btrim("username") AND char_length("username") BETWEEN 3 AND 32
  ),
  CONSTRAINT "users_username_normalized_check" CHECK (
    "usernameNormalized" ~ '^[a-z0-9_]{3,32}$'
  )
);

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent" VARCHAR(512),
  "ipCreated" VARCHAR(45),
  "ipLastSeen" VARCHAR(45),
  "revokedAt" TIMESTAMPTZ(3),
  "revocationReason" "SessionRevocationReason",
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_revocation_pair_check" CHECK (
    ("revokedAt" IS NULL AND "revocationReason" IS NULL)
    OR ("revokedAt" IS NOT NULL AND "revocationReason" IS NOT NULL)
  ),
  CONSTRAINT "auth_sessions_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL,
  "tokenHash" BYTEA NOT NULL,
  "parentTokenId" UUID,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_hash_length_check" CHECK (octet_length("tokenHash") = 32),
  CONSTRAINT "refresh_tokens_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "email_verification_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" BYTEA NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_tokens_hash_length_check" CHECK (octet_length("tokenHash") = 32),
  CONSTRAINT "email_verification_tokens_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" BYTEA NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_hash_length_check" CHECK (octet_length("tokenHash") = 32),
  CONSTRAINT "password_reset_tokens_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "security_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "SecurityEventType" NOT NULL,
  "userId" UUID,
  "sessionId" UUID,
  "requestId" UUID,
  "subjectHash" VARCHAR(64),
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_events_subject_hash_check" CHECK (
    "subjectHash" IS NULL OR "subjectHash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("emailNormalized");
CREATE UNIQUE INDEX "users_username_normalized_key" ON "users"("usernameNormalized");
CREATE INDEX "auth_sessions_user_active_idx" ON "auth_sessions"("userId", "revokedAt", "expiresAt");
CREATE INDEX "auth_sessions_user_created_idx" ON "auth_sessions"("userId", "createdAt");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expiresAt");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("tokenHash");
CREATE UNIQUE INDEX "refresh_tokens_parent_token_id_key" ON "refresh_tokens"("parentTokenId");
CREATE INDEX "refresh_tokens_session_created_idx" ON "refresh_tokens"("sessionId", "createdAt");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expiresAt");
CREATE UNIQUE INDEX "email_verification_tokens_hash_key" ON "email_verification_tokens"("tokenHash");
CREATE UNIQUE INDEX "email_verification_tokens_one_active_key"
  ON "email_verification_tokens"("userId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expiresAt");
CREATE UNIQUE INDEX "password_reset_tokens_hash_key" ON "password_reset_tokens"("tokenHash");
CREATE UNIQUE INDEX "password_reset_tokens_one_active_key"
  ON "password_reset_tokens"("userId")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expiresAt");
CREATE INDEX "security_events_user_created_idx" ON "security_events"("userId", "createdAt");
CREATE INDEX "security_events_type_created_idx" ON "security_events"("type", "createdAt");
CREATE INDEX "security_events_request_id_idx" ON "security_events"("requestId");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_parentTokenId_fkey"
  FOREIGN KEY ("parentTokenId") REFERENCES "refresh_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
