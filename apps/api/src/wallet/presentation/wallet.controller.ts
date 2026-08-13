import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/domain/auth.types';
import { WalletQueryService } from '../application/wallet-query.service';
import { WalletHistoryQueryDto } from './dto/wallet-history-query.dto';

@ApiTags('Wallet')
@ApiCookieAuth('accessCookie')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletQuery: WalletQueryService) {}

  @Get()
  async wallet(@CurrentUser() principal: AuthenticatedPrincipal) {
    const wallet = await this.walletQuery.getWallet(principal.userId);
    return {
      wallet: {
        id: wallet.id,
        currency: 'BIC' as const,
        balance: wallet.balance.toString(),
        createdAt: wallet.createdAt,
      },
    };
  }

  @Get('transactions')
  async transactions(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: WalletHistoryQueryDto,
  ) {
    const page = await this.walletQuery.getHistory(principal.userId, query.cursor, query.limit);
    return {
      transactions: page.transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount.toString(),
        balanceBefore: transaction.balanceBefore.toString(),
        balanceAfter: transaction.balanceAfter.toString(),
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        createdAt: transaction.createdAt,
      })),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    };
  }
}
