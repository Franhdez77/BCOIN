CREATE TABLE "mining_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "claimedAt" TIMESTAMPTZ(3),
  "rewardAmount" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mining_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_sessions_reward_positive_check" CHECK ("rewardAmount" > 0),
  CONSTRAINT "mining_sessions_time_order_check" CHECK ("endsAt" > "startedAt"),
  CONSTRAINT "mining_sessions_claim_time_check"
    CHECK ("claimedAt" IS NULL OR "claimedAt" >= "endsAt")
);

-- An open session remains the user's current session even after its 24-hour duration has elapsed;
-- the user must claim it before a new session can be started. This prevents reward hoarding and
-- gives PostgreSQL, not an application pre-check, the final say under concurrent starts.
CREATE UNIQUE INDEX "mining_sessions_one_open_per_user_key"
  ON "mining_sessions"("userId")
  WHERE "claimedAt" IS NULL;

CREATE INDEX "mining_sessions_history_idx"
  ON "mining_sessions"("userId", "createdAt" DESC, "id" DESC);

ALTER TABLE "mining_sessions" ADD CONSTRAINT "mining_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
