import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApplication } from '../src/app/configure-application';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('non-production OpenAPI document', () => {
  let app: NestExpressApplication;
  const previous = process.env.OPENAPI_ENABLED;

  beforeAll(async () => {
    process.env.OPENAPI_ENABLED = 'true';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $disconnect: jest.fn().mockResolvedValue(undefined) })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    const config = app.get(ConfigService);
    jest.spyOn(config, 'getOrThrow').mockImplementation((property: string) => {
      if (property === 'OPENAPI_ENABLED') return true;
      return process.env[property] ?? config.get(property);
    });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    process.env.OPENAPI_ENABLED = previous;
    await app.close();
  });

  it('documents every auth route, cookie scheme, CSRF boundary, and safe response shape', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const document = response.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            security?: Array<Record<string, string[]>>;
            parameters?: Array<{ in: string; name: string; required?: boolean }>;
          }
        >
      >;
      components: { securitySchemes: Record<string, unknown> };
    };
    const expectedPaths = [
      '/api/v1/auth/csrf',
      '/api/v1/auth/register',
      '/api/v1/auth/verify-email',
      '/api/v1/auth/resend-verification',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/logout-all',
      '/api/v1/auth/forgot-password',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/me',
      '/api/v1/auth/sessions',
      '/api/v1/auth/sessions/{sessionId}',
    ];

    expect(
      Object.keys(document.paths)
        .filter((path) => path.startsWith('/api/v1/auth'))
        .sort(),
    ).toEqual(expectedPaths.sort());
    expect(document.components.securitySchemes.accessCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'bichocoin_access',
    });
    expect(document.components.securitySchemes.refreshCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'bichocoin_refresh',
    });
    expect(document.components.securitySchemes.csrfNonceCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'bichocoin_csrf',
    });
    expect(document.paths['/api/v1/auth/csrf']?.get?.security).toBeUndefined();
    expect(document.paths['/api/v1/auth/register']?.post?.security).toBeUndefined();
    expect(document.paths['/api/v1/auth/me']?.get?.security).toEqual([{ accessCookie: [] }]);
    expect(document.paths['/api/v1/auth/refresh']?.post?.security).toEqual([{ refreshCookie: [] }]);
    expect(document.paths['/api/v1/auth/register']?.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'header', name: 'Origin', required: true }),
        expect.objectContaining({ in: 'header', name: 'X-CSRF-Token', required: true }),
      ]),
    );
    expect(JSON.stringify(document)).not.toMatch(
      /passwordHash|tokenHash|refreshToken|accessToken/i,
    );
  });

  it('serves the UI only when explicitly enabled outside production', () =>
    request(app.getHttpServer()).get('/api/docs').expect(200));
});
