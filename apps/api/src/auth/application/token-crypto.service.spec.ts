import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment';
import { TokenCryptoService } from './token-crypto.service';

describe('TokenCryptoService', () => {
  const config = new ConfigService<EnvironmentVariables, true>({
    RATE_LIMIT_HMAC_SECRET: 'test-rate-limit-secret-at-least-32-bytes',
  });
  const service = new TokenCryptoService(config);

  it('creates parseable id.secret tokens while exposing only a hash for storage', () => {
    const token = service.createOpaqueToken();
    const parsed = service.parseOpaqueToken(token.value);

    expect(token.value).not.toContain(Buffer.from(token.hash).toString('hex'));
    expect(parsed?.id).toBe(token.id);
    expect(parsed === null ? false : service.hashesEqual(parsed.hash, token.hash)).toBe(true);
  });

  it.each([undefined, '', 'invalid', `${crypto.randomUUID()}.too-short`])(
    'rejects malformed opaque tokens',
    (value) => {
      expect(service.parseOpaqueToken(value)).toBeNull();
    },
  );

  it('pseudonymizes rate-limit subjects deterministically', () => {
    expect(service.subjectHash('player@example.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(service.subjectHash('player@example.com')).toBe(
      service.subjectHash('player@example.com'),
    );
  });
});

