import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { EnvironmentVariables } from '../../config/environment';
import { PrismaClient } from '../../generated/prisma/client';

const DATABASE_CONNECTION_TIMEOUT_MS = 2_000;
const DATABASE_IDLE_TIMEOUT_MS = 10_000;
const DATABASE_POOL_MAX_CONNECTIONS = 10;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const connectionString = config.getOrThrow('DATABASE_URL', { infer: true });
    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
      max: DATABASE_POOL_MAX_CONNECTIONS,
    });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
