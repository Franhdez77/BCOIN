import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { UserRole, UserStatus } from '../../../generated/prisma/enums';

export class ApiPublicUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() username!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class ApiCsrfDataDto {
  @ApiProperty({ description: 'Send in the X-CSRF-Token header; retain only in memory.' })
  csrfToken!: string;
}

export class ApiAcceptedDataDto {
  @ApiProperty() accepted!: boolean;
}

export class ApiEmailVerifiedDataDto {
  @ApiProperty() emailVerified!: boolean;
}

export class ApiAuthenticationDataDto extends ApiCsrfDataDto {
  @ApiProperty({ type: ApiPublicUserDto }) user!: ApiPublicUserDto;
  @ApiProperty({ format: 'date-time' }) accessExpiresAt!: Date;
}

export class ApiLogoutDataDto extends ApiCsrfDataDto {
  @ApiProperty() loggedOut!: boolean;
}

export class ApiPasswordResetDataDto extends ApiCsrfDataDto {
  @ApiProperty() passwordReset!: boolean;
}

export class ApiCurrentUserDataDto {
  @ApiProperty({ type: ApiPublicUserDto }) user!: ApiPublicUserDto;
}

export class ApiSessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) lastUsedAt!: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty() current!: boolean;
}

export class ApiSessionsDataDto {
  @ApiProperty({ type: [ApiSessionDto] }) sessions!: ApiSessionDto[];
}

export class ApiSessionRevokedDataDto {
  @ApiProperty() revoked!: boolean;
  @ApiProperty() currentSessionRevoked!: boolean;
}

export function ApiEnvelopeResponse(status: number, model: Type<unknown>): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        type: 'object',
        required: ['success', 'data', 'requestId'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { $ref: getSchemaPath(model) },
          requestId: { type: 'string', format: 'uuid' },
        },
      },
    }),
  );
}

export function ApiCsrfProtected(rateLimited = false): MethodDecorator {
  const decorators = [
    ApiHeader({
      name: 'Origin',
      required: true,
      description: 'Must exactly match an API CORS allowlist origin.',
    }),
    ApiHeader({
      name: 'X-CSRF-Token',
      required: true,
      description: 'HMAC token returned by GET /api/v1/auth/csrf; retain only in memory.',
    }),
    ApiResponse({
      status: 403,
      description: 'Origin, Fetch Metadata, or CSRF validation failed.',
      schema: errorEnvelopeSchema('CSRF_VALIDATION_FAILED'),
    }),
  ];
  if (rateLimited) {
    decorators.push(
      ApiResponse({
        status: 429,
        description: 'The targeted authentication rate limit was exceeded.',
        schema: errorEnvelopeSchema('RATE_LIMIT_EXCEEDED'),
      }),
    );
  }
  return applyDecorators(...decorators);
}

function errorEnvelopeSchema(exampleCode: string): Record<string, unknown> {
  return {
    type: 'object',
    required: ['success', 'error', 'requestId'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', example: exampleCode },
          message: { type: 'string' },
        },
      },
      requestId: { type: 'string', format: 'uuid' },
    },
  };
}
