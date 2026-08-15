import { HttpStatus } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';

export function miningAlreadyActive(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.CONFLICT,
    'MINING_ALREADY_ACTIVE',
    'An open mining session already exists.',
  );
}

export function miningSessionNotFound(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.NOT_FOUND,
    'MINING_SESSION_NOT_FOUND',
    'No mining session could be found.',
  );
}

export function miningNotEligible(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.CONFLICT,
    'MINING_NOT_ELIGIBLE',
    'The mining session is not eligible to be claimed yet.',
  );
}

export function miningAlreadyClaimed(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.CONFLICT,
    'MINING_ALREADY_CLAIMED',
    'The mining session has already been claimed.',
  );
}

export function miningCursorInvalid(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'MINING_CURSOR_INVALID',
    'The mining history cursor is invalid.',
  );
}
