import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/domain/auth.types';
import { ApiHttpException } from '../../common/errors/api-http.exception';
import { MiningApplicationService } from '../application/mining-application.service';
import { MiningQueryService } from '../application/mining-query.service';
import { toMiningSessionView, type MiningSessionView } from '../domain/mining-session';
import { MiningHistoryQueryDto } from './dto/mining-history-query.dto';

@ApiTags('Mining')
@ApiCookieAuth('accessCookie')
@Controller('mining')
export class MiningController {
  constructor(
    private readonly miningApplication: MiningApplicationService,
    private readonly miningQuery: MiningQueryService,
  ) {}

  @Post('start')
  async start(@CurrentUser() principal: AuthenticatedPrincipal, @Body() body: unknown) {
    assertEmptyCommandBody(body);
    const session = await this.miningApplication.start(principal.userId);
    return { session: serializeMiningSession(toMiningSessionView(session, new Date())) };
  }

  @Get('current')
  async current(@CurrentUser() principal: AuthenticatedPrincipal) {
    const session = await this.miningQuery.getCurrent(principal.userId);
    return { session: session === null ? null : serializeMiningSession(session) };
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claim(@CurrentUser() principal: AuthenticatedPrincipal, @Body() body: unknown) {
    assertEmptyCommandBody(body);
    const result = await this.miningApplication.claim(principal.userId);
    return {
      session: serializeMiningSession(toMiningSessionView(result.session, new Date())),
      wallet: {
        currency: 'BIC' as const,
        balance: result.walletBalance.toString(),
      },
      transaction: { id: result.transactionId },
    };
  }

  @Get('history')
  async history(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: MiningHistoryQueryDto,
  ) {
    const page = await this.miningQuery.getHistory(principal.userId, query.cursor, query.limit);
    return {
      sessions: page.sessions.map(serializeMiningSession),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    };
  }
}

function serializeMiningSession(session: MiningSessionView) {
  return {
    id: session.id,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    claimedAt: session.claimedAt,
    rewardAmount: session.rewardAmount.toString(),
    eligible: session.eligible,
    createdAt: session.createdAt,
  };
}

function assertEmptyCommandBody(body: unknown): void {
  if (body === undefined) return;
  if (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  ) {
    return;
  }

  throw new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'Request validation failed.',
  );
}
