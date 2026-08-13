import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { EnvironmentVariables } from '../../config/environment';
import { ACCESS_TOKEN_ALGORITHM } from '../domain/auth.constants';
import type { AccessTokenPayload } from '../domain/auth.types';

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  sign(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sid: sessionId, jti: randomUUID() },
      {
        algorithm: ACCESS_TOKEN_ALGORITHM,
        audience: this.config.getOrThrow('JWT_AUDIENCE', { infer: true }),
        issuer: this.config.getOrThrow('JWT_ISSUER', { infer: true }),
        secret: this.config.getOrThrow('JWT_SIGNING_SECRET', { infer: true }),
        subject: userId,
        expiresIn: this.config.getOrThrow('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      },
    );
  }

  verify(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      audience: this.config.getOrThrow('JWT_AUDIENCE', { infer: true }),
      issuer: this.config.getOrThrow('JWT_ISSUER', { infer: true }),
      secret: this.config.getOrThrow('JWT_SIGNING_SECRET', { infer: true }),
    });
  }
}
