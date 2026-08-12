import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiHttpException } from '../common/errors/api-http.exception';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

const READINESS_TIMEOUT_MS = 2_500;

export interface LivenessResult {
  status: 'ok';
}

export interface ReadinessResult extends LivenessResult {
  checks: {
    database: {
      status: 'up';
    };
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness(): LivenessResult {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResult> {
    try {
      const databaseQuery = this.prisma.$queryRaw`SELECT 1`;
      await withTimeout(Promise.resolve(databaseQuery), READINESS_TIMEOUT_MS);

      return {
        status: 'ok',
        checks: {
          database: {
            status: 'up',
          },
        },
      };
    } catch {
      throw new ApiHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Service is not ready.',
      );
    }
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new ReadinessTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

class ReadinessTimeoutError extends Error {
  constructor() {
    super('The readiness check timed out.');
    this.name = ReadinessTimeoutError.name;
  }
}
