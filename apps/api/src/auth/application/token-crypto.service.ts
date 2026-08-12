import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment';
import { TOKEN_SECRET_BYTES } from '../domain/auth.constants';

export interface OpaqueToken {
  id: string;
  secret: string;
  value: string;
  hash: Uint8Array<ArrayBuffer>;
}

@Injectable()
export class TokenCryptoService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  createOpaqueToken(): OpaqueToken {
    const id = randomUUID();
    const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
    return { id, secret, value: `${id}.${secret}`, hash: this.hashToken(secret) };
  }

  parseOpaqueToken(
    value: string | undefined,
  ): { id: string; hash: Uint8Array<ArrayBuffer> } | null {
    if (value === undefined) return null;
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(
      value,
    );
    if (match === null || match[1] === undefined || match[2] === undefined) return null;
    return { id: match[1], hash: this.hashToken(match[2]) };
  }

  hashToken(secret: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(createHash('sha256').update(secret, 'utf8').digest());
  }

  subjectHash(subject: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow('RATE_LIMIT_HMAC_SECRET', { infer: true }),
    )
      .update(subject, 'utf8')
      .digest('hex');
  }

  hashesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && timingSafeEqual(left, right);
  }
}
