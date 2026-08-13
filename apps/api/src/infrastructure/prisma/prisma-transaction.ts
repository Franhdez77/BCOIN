import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from './prisma.service';

const MAX_SERIALIZABLE_RETRIES = 3;

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch (error: unknown) {
      if (!isPrismaCode(error, 'P2034') || attempt === MAX_SERIALIZABLE_RETRIES) {
        throw error;
      }
    }
  }

  throw new Error('Serializable retry loop exhausted.');
}

export function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
