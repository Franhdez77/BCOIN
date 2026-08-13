import { HttpStatus } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';

export function walletNotFound(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.NOT_FOUND,
    'WALLET_NOT_FOUND',
    'The wallet could not be found.',
  );
}

export function invalidWalletMovement(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'WALLET_MOVEMENT_INVALID',
    'The wallet movement is invalid.',
  );
}

export function insufficientBalance(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.CONFLICT,
    'WALLET_INSUFFICIENT_BALANCE',
    'The wallet does not have enough balance.',
  );
}

export function idempotencyConflict(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.CONFLICT,
    'WALLET_IDEMPOTENCY_CONFLICT',
    'The idempotency key was already used for another operation.',
  );
}
