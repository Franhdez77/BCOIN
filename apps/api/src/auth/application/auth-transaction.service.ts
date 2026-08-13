import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import {
  isPrismaCode,
  runSerializableTransaction,
} from '../../infrastructure/prisma/prisma-transaction';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuthTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return runSerializableTransaction(this.prisma, operation);
  }
}

export { isPrismaCode };
