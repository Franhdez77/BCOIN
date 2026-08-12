import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { REQUEST_BODY_LIMIT_BYTES } from '../src/config/environment';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId: string;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

interface ReadinessData {
  status: 'ok';
  checks: {
    database: {
      status: 'up';
    };
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('health endpoints', () => {
  let app: NestExpressApplication;
  const queryRaw = jest.fn<Promise<unknown>, [TemplateStringsArray]>();

  beforeAll(async () => {
    queryRaw.mockResolvedValue([{ value: 1 }]);

    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $disconnect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
        $queryRaw: queryRaw,
      })
      .compile();

    app = testingModule.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    queryRaw.mockResolvedValue([{ value: 1 }]);
  });

  it('GET /health/live reports process liveness without querying the database', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-ID', 'client-controlled-value')
      .expect(200);
    const body = response.body as SuccessEnvelope<{ status: 'ok' }>;

    expect(body).toEqual({
      success: true,
      data: { status: 'ok' },
      requestId: body.requestId,
    });
    expect(body.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body.requestId).not.toBe('client-controlled-value');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each(['/health', '/health/ready'])('GET %s reports database readiness', async (path) => {
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const body = response.body as SuccessEnvelope<ReadinessData>;

    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      status: 'ok',
      checks: {
        database: {
          status: 'up',
        },
      },
    });
    expect(body.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('returns a safe 503 response when the database is unavailable', async () => {
    queryRaw.mockRejectedValueOnce(
      new Error(
        'Unable to connect to postgresql://secret-user:secret-password@private-host/database',
      ),
    );

    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    const body = response.body as ErrorEnvelope;
    const serializedBody = JSON.stringify(body);

    expect(body).toEqual({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready.',
      },
      requestId: body.requestId,
    });
    expect(body.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(serializedBody).not.toContain('secret-password');
    expect(serializedBody).not.toContain('private-host');
    expect(serializedBody.toLowerCase()).not.toContain('stack');
  });

  it('uses the safe error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    const body = response.body as ErrorEnvelope;

    expect(body.success).toBe(false);
    expect(body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    });
    expect(body.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('returns the safe error envelope when the request body is too large', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/does-not-exist')
      .send({ payload: 'x'.repeat(REQUEST_BODY_LIMIT_BYTES) })
      .expect(413);
    const body = response.body as ErrorEnvelope;

    expect(body).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.',
      },
      requestId: body.requestId,
    });
    expect(body.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('applies security headers without HSTS outside production', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('allows configured CORS origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS access to unconfigured origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://attacker.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

const describeDatabaseIntegration =
  process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

describeDatabaseIntegration('database readiness integration', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = testingModule.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects through the configured Prisma adapter', async () => {
    const prisma = app.get(PrismaService);

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'NO_CODE';
      throw new Error(`Prisma adapter check failed: ${errorName}/${errorCode}`);
    }
  });

  it('executes the readiness query through Prisma', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    const body = response.body as SuccessEnvelope<ReadinessData>;

    expect(body.data.checks.database.status).toBe('up');
  });
});
