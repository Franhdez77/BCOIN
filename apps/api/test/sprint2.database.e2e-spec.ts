import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { EMAIL_SENDER, type EmailSender } from '../src/auth/application/email-sender.port';
import { WalletTransactionType } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { WalletApplicationService } from '../src/wallet/application/wallet-application.service';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'secure football phrase';
const describeDatabase = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

interface SuccessBody<T> {
  data: T;
}

jest.setTimeout(60_000);

describeDatabase('Sprint 2 user and wallet PostgreSQL integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let walletApplication: WalletApplicationService;
  let agent: ReturnType<typeof request.agent>;
  const verificationTokens = new Map<string, string>();
  const emailSender: EmailSender = {
    sendEmailVerification: jest.fn((recipient: string, token: string): Promise<void> => {
      verificationTokens.set(recipient, token);
      return Promise.resolve();
    }),
    sendPasswordReset: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    await assertTestDatabase();
    deployMigrations();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();

    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    walletApplication = app.get(WalletApplicationService);
    await assertConnectedDatabase(prisma);
    await cleanup();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (prisma !== undefined) await cleanup();
    if (app !== undefined) await app.close();
  });

  beforeEach(async () => {
    verificationTokens.clear();
    await cleanup();
    agent = request.agent(app.getHttpServer());
  });

  it('creates exactly one zero-balance wallet atomically with a new registration', async () => {
    await registerOnly('wallet@example.com', 'WalletPlayer');

    const user = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'wallet@example.com' },
    });
    const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });

    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.balance).toBe(0n);
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('serves profile from the authenticated principal and rejects mass assignment', async () => {
    await registerVerifyAndLogin('profile@example.com', 'ProfilePlayer');

    await agent
      .get('/api/v1/users/me')
      .query({ userId: crypto.randomUUID() })
      .expect(200)
      .expect(({ body }) => {
        expect((body as SuccessBody<{ user: { email: string } }>).data.user.email).toBe(
          'profile@example.com',
        );
      });

    let csrf = await issueCsrf(agent);
    await agent
      .patch('/api/v1/users/me')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ username: 'Updated_Player' })
      .expect(200)
      .expect(({ body }) => {
        expect((body as SuccessBody<{ user: { username: string } }>).data.user.username).toBe(
          'Updated_Player',
        );
      });

    csrf = await issueCsrf(agent);
    await agent
      .patch('/api/v1/users/me')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ username: 'Still_Player', role: 'ADMIN', status: 'BANNED', balance: '999999' })
      .expect(400);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'profile@example.com' },
    });
    expect(stored.username).toBe('Updated_Player');
    expect(stored.role).toBe('USER');
    expect(stored.status).toBe('ACTIVE');
  });

  it('never accepts userId as wallet authority', async () => {
    await registerVerifyAndLogin('owner@example.com', 'OwnerPlayer');
    const owner = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'owner@example.com' },
    });
    const ownerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: owner.id } });

    const attacker = request.agent(app.getHttpServer());
    await registerVerifyAndLogin('attacker@example.com', 'AttackerPlayer', attacker);
    const attackerUser = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'attacker@example.com' },
    });
    const attackerWallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: attackerUser.id },
    });

    expect(attackerWallet.id).not.toBe(ownerWallet.id);

    await attacker
      .get('/api/v1/wallet')
      .query({ userId: owner.id })
      .expect(200)
      .expect(({ body }) => {
        expect((body as SuccessBody<{ wallet: { id: string } }>).data.wallet.id).toBe(
          attackerWallet.id,
        );
      });
  });

  it('commits wallet balance and ledger entry together', async () => {
    const user = await registerOnly('movement@example.com', 'MovementPlayer');

    const movement = await walletApplication.recordMovement({
      userId: user.id,
      type: WalletTransactionType.CREDIT,
      amount: 25n,
      idempotencyKey: 'test-credit-25',
      referenceType: 'TEST',
      referenceId: 'credit-25',
    });

    expect(movement.balanceBefore).toBe(0n);
    expect(movement.balanceAfter).toBe(25n);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(25n);

    const ledger = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      amount: 25n,
      balanceBefore: 0n,
      balanceAfter: 25n,
      idempotencyKey: 'test-credit-25',
    });
  });

  it('does not lose updates under concurrent economic operations', async () => {
    const user = await registerOnly('concurrency@example.com', 'ConcurrencyPlayer');

    await Promise.all([
      walletApplication.recordMovement({
        userId: user.id,
        type: WalletTransactionType.CREDIT,
        amount: 10n,
        idempotencyKey: 'concurrent-a',
      }),
      walletApplication.recordMovement({
        userId: user.id,
        type: WalletTransactionType.CREDIT,
        amount: 15n,
        idempotencyKey: 'concurrent-b',
      }),
    ]);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(25n);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(2);
  });

  it('deduplicates concurrent idempotent movements and rejects key reuse with another intent', async () => {
    const user = await registerOnly('idempotent@example.com', 'IdempotentPlayer');
    const input = {
      userId: user.id,
      type: WalletTransactionType.CREDIT,
      amount: 10n,
      idempotencyKey: 'same-operation',
      referenceType: 'TEST',
      referenceId: 'same-operation',
    };

    const results = await Promise.all([
      walletApplication.recordMovement(input),
      walletApplication.recordMovement(input),
    ]);

    expect(results[0]?.transactionId).toBe(results[1]?.transactionId);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(10n);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(1);

    await expect(
      walletApplication.recordMovement({
        ...input,
        amount: 11n,
      }),
    ).rejects.toMatchObject({ errorCode: 'WALLET_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects overdrafts without producing ledger history', async () => {
    const user = await registerOnly('debit@example.com', 'DebitPlayer');

    await expect(
      walletApplication.recordMovement({
        userId: user.id,
        type: WalletTransactionType.DEBIT,
        amount: -1n,
        idempotencyKey: 'overdraft',
      }),
    ).rejects.toMatchObject({ errorCode: 'WALLET_INSUFFICIENT_BALANCE' });

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(0n);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(0);
  });

  it('enforces ledger immutability at the database boundary', async () => {
    const user = await registerOnly('immutable@example.com', 'ImmutablePlayer');
    const result = await walletApplication.recordMovement({
      userId: user.id,
      type: WalletTransactionType.ADJUSTMENT,
      amount: 5n,
      idempotencyKey: 'immutable-entry',
      reason: 'integration test',
    });

    await expect(
      prisma.walletTransaction.update({
        where: { id: result.transactionId },
        data: { amount: 999n },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.walletTransaction.delete({ where: { id: result.transactionId } }),
    ).rejects.toBeDefined();

    const entry = await prisma.walletTransaction.findUniqueOrThrow({
      where: { id: result.transactionId },
    });
    expect(entry.amount).toBe(5n);
  });

  it('returns bounded cursor history without internal economic metadata', async () => {
    await registerVerifyAndLogin('history@example.com', 'HistoryPlayer');
    const user = await prisma.user.findUniqueOrThrow({
      where: { emailNormalized: 'history@example.com' },
    });

    for (let index = 0; index < 3; index += 1) {
      await walletApplication.recordMovement({
        userId: user.id,
        type: WalletTransactionType.CREDIT,
        amount: 1n,
        idempotencyKey: `history-${index}`,
        referenceType: 'TEST',
        referenceId: `history-${index}`,
        metadata: { privateInternalMarker: `secret-${index}` },
      });
    }

    const first = await agent.get('/api/v1/wallet/transactions').query({ limit: 2 }).expect(200);
    const firstData = (
      first.body as SuccessBody<{
        transactions: Array<Record<string, unknown>>;
        nextCursor?: string;
      }>
    ).data;

    expect(firstData.transactions).toHaveLength(2);
    expect(firstData.nextCursor).toBeDefined();
    expect(JSON.stringify(firstData)).not.toContain('idempotencyKey');
    expect(JSON.stringify(firstData)).not.toContain('privateInternalMarker');

    const second = await agent
      .get('/api/v1/wallet/transactions')
      .query({ limit: 2, cursor: firstData.nextCursor })
      .expect(200);
    expect(
      (second.body as SuccessBody<{ transactions: unknown[] }>).data.transactions,
    ).toHaveLength(1);

    await agent.get('/api/v1/wallet/transactions').query({ limit: 51 }).expect(400);
    await agent.get('/api/v1/wallet/transactions').query({ cursor: '***' }).expect(400);
  });

  async function registerOnly(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<{ id: string }> {
    const csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email, username, password: PASSWORD })
      .expect(201);

    return prisma.user.findUniqueOrThrow({ where: { emailNormalized: email.toLowerCase() } });
  }

  async function registerVerifyAndLogin(
    email: string,
    username: string,
    targetAgent = agent,
  ): Promise<void> {
    await registerOnly(email, username, targetAgent);
    const token = verificationTokens.get(email);
    if (token === undefined) throw new Error('Verification token was not captured.');

    let csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/verify-email')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ token })
      .expect(200);

    csrf = await issueCsrf(targetAgent);
    await targetAgent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ identifier: email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup(): Promise<void> {
    if (prisma === undefined) return;
    await assertConnectedDatabase(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "wallet_transactions", "wallets", "security_events", "refresh_tokens", ' +
        '"auth_sessions", "email_verification_tokens", "password_reset_tokens", "users" CASCADE',
    );
  }
});

async function issueCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as SuccessBody<{ csrfToken: string }>).data.csrfToken;
}

function deployMigrations(): void {
  const prismaCli = [
    resolve(process.cwd(), 'node_modules/prisma/build/index.js'),
    resolve(process.cwd(), '../../node_modules/prisma/build/index.js'),
  ].find((candidate) => existsSync(candidate));
  if (prismaCli === undefined) throw new Error('Local Prisma CLI was not found.');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
}

async function assertTestDatabase(): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');

  const client = new Client({ connectionString: configured });
  try {
    await client.connect();
    const result = await client.query<{ database: string }>(
      'SELECT current_database() AS database',
    );
    const expected = new URL(configured).pathname.slice(1);
    if (!expected.endsWith('_test') || result.rows[0]?.database !== expected) {
      throw new Error('Refusing to run Sprint 2 tests outside the dedicated test database.');
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertConnectedDatabase(prisma: PrismaService): Promise<void> {
  const configured = process.env.AUTH_TEST_DATABASE_URL;
  if (configured === undefined) throw new Error('AUTH_TEST_DATABASE_URL is missing.');

  const expected = new URL(configured).pathname.slice(1);
  const result = await prisma.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  if (!expected.endsWith('_test') || result[0]?.database !== expected) {
    throw new Error(
      'Refusing destructive Sprint 2 test cleanup outside the dedicated test database.',
    );
  }
}
