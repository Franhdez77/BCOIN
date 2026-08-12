import { resolve } from 'node:path';

import { config as loadEnvironmentFiles } from 'dotenv';

loadEnvironmentFiles({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

process.env.NODE_ENV = 'test';
process.env.API_PORT = '3001';
process.env.DATABASE_URL ??=
  'postgresql://bichocoin_test:bichocoin_test@127.0.0.1:5432/bichocoin_test';
// HTTP assertions must be deterministic even when a developer changes local ports in .env.
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
