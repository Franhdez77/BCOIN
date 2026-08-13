CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT');

CREATE TABLE "wallets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "balance" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallets_balance_nonnegative_check" CHECK ("balance" >= 0)
);

CREATE TABLE "wallet_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "walletId" UUID NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "amount" BIGINT NOT NULL,
  "balanceBefore" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  "referenceType" VARCHAR(64),
  "referenceId" VARCHAR(128),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "actorUserId" UUID,
  "requestId" UUID,
  "reason" VARCHAR(500),
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_transactions_amount_check" CHECK (
    ("type" = 'CREDIT' AND "amount" > 0)
    OR ("type" = 'DEBIT' AND "amount" < 0)
    OR ("type" = 'ADJUSTMENT' AND "amount" <> 0)
  ),
  CONSTRAINT "wallet_transactions_balance_before_check" CHECK ("balanceBefore" >= 0),
  CONSTRAINT "wallet_transactions_balance_after_check" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "wallet_transactions_balance_equation_check"
    CHECK ("balanceAfter" = "balanceBefore" + "amount"),
  CONSTRAINT "wallet_transactions_reference_pair_check" CHECK (
    ("referenceType" IS NULL AND "referenceId" IS NULL)
    OR ("referenceType" IS NOT NULL AND "referenceId" IS NOT NULL)
  ),
  CONSTRAINT "wallet_transactions_idempotency_length_check"
    CHECK (char_length("idempotencyKey") BETWEEN 1 AND 128)
);

CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("userId");
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key"
  ON "wallet_transactions"("idempotencyKey");
CREATE UNIQUE INDEX "wallet_transactions_reference_key"
  ON "wallet_transactions"("referenceType", "referenceId");
CREATE INDEX "wallet_transactions_history_idx"
  ON "wallet_transactions"("walletId", "createdAt" DESC, "id" DESC);
CREATE INDEX "wallet_transactions_actor_idx"
  ON "wallet_transactions"("actorUserId", "createdAt" DESC);

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sprint 1 users receive exactly one zero-balance wallet. A zero opening balance is not an
-- economic movement, so no synthetic ledger entry is created.
INSERT INTO "wallets" ("id", "userId", "balance", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

CREATE FUNCTION reject_wallet_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions are immutable';
END;
$$;

CREATE TRIGGER wallet_transactions_immutable_update
BEFORE UPDATE ON "wallet_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_wallet_transaction_mutation();

CREATE TRIGGER wallet_transactions_immutable_delete
BEFORE DELETE ON "wallet_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_wallet_transaction_mutation();
