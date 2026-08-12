import { HttpStatus } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';

export function invalidCredentials(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'The credentials are invalid.',
  );
}

export function invalidSession(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.UNAUTHORIZED,
    'AUTHENTICATION_REQUIRED',
    'Authentication is required.',
  );
}

export function invalidRefreshToken(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_REFRESH_TOKEN',
    'The refresh session is invalid or has expired.',
  );
}

export function invalidVerification(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'EMAIL_VERIFICATION_INVALID',
    'The verification token is invalid or has expired.',
  );
}

export function invalidPasswordReset(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.BAD_REQUEST,
    'PASSWORD_RESET_INVALID',
    'The password reset token is invalid or has expired.',
  );
}

export function passwordRejected(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'PASSWORD_REJECTED',
    'The password does not meet the security policy.',
  );
}
