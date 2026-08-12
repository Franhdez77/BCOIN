import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnvironmentFile } from 'dotenv';
import { defineConfig } from 'prisma/config';

const PRISMA_CLI_FALLBACK_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/bichocoin_build';

const environmentFile = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')].find(
  (candidate) => existsSync(candidate),
);

if (environmentFile !== undefined) {
  loadEnvironmentFile({ path: environmentFile, quiet: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Client generation and compilation do not connect to this fallback URL.
    // Runtime configuration still requires and validates DATABASE_URL.
    url: process.env.DATABASE_URL?.trim() || PRISMA_CLI_FALLBACK_DATABASE_URL,
  },
});
