import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';

import type { EnvironmentVariables } from '../../config/environment';
import { TargetedRateLimitGuard } from './targeted-rate-limit.guard';

describe('TargetedRateLimitGuard', () => {
  const config = new ConfigService<EnvironmentVariables, true>({
    AUTH_LOGIN_RATE_LIMIT_MAX: 2,
    AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 600,
    RATE_LIMIT_HMAC_SECRET: 'test-rate-limit-secret-at-least-32-bytes',
  });

  it('limits IP and account subjects independently and emits delta reset headers', () => {
    const guard = createGuard();
    const first = context('127.0.0.1', 'one@example.com');
    const second = context('127.0.0.1', 'two@example.com');
    const third = context('127.0.0.1', 'three@example.com');

    expect(guard.canActivate(first.context)).toBe(true);
    expect(guard.canActivate(second.context)).toBe(true);
    expect(() => guard.canActivate(third.context)).toThrow('Too many authentication attempts.');
    expect(Number(second.headers.get('RateLimit-Reset'))).toBeLessThanOrEqual(600);

    const subjectGuard = createGuard();
    expect(subjectGuard.canActivate(context('127.0.0.2', 'same@example.com').context)).toBe(true);
    expect(subjectGuard.canActivate(context('127.0.0.3', 'same@example.com').context)).toBe(true);
    expect(() =>
      subjectGuard.canActivate(context('127.0.0.4', 'same@example.com').context),
    ).toThrow('Too many authentication attempts.');
  });

  it('stops before allocating new subject buckets once an IP is blocked', () => {
    const guard = createGuard();
    const internal = guard as unknown as {
      buckets: Map<string, { count: number; resetAt: number }>;
    };

    expect(guard.canActivate(context('127.0.0.5', 'one@example.com').context)).toBe(true);
    expect(guard.canActivate(context('127.0.0.5', 'two@example.com').context)).toBe(true);
    const sizeBeforeRejection = internal.buckets.size;

    expect(() =>
      guard.canActivate(context('127.0.0.5', 'never-allocated@example.com').context),
    ).toThrow('Too many authentication attempts.');
    expect(internal.buckets.size).toBe(sizeBeforeRejection);
  });

  it('fails closed without growing its store after reaching the active bucket cap', () => {
    const guard = createGuard();
    const internal = guard as unknown as {
      buckets: Map<string, { count: number; resetAt: number }>;
      nextPruneAt: number;
    };
    const resetAt = Date.now() + 60_000;
    for (let index = 0; index < 10_000; index += 1) {
      internal.buckets.set(`active:${index}`, { count: 1, resetAt });
    }
    internal.nextPruneAt = resetAt;

    expect(() => guard.canActivate(context('127.0.0.9', 'new@example.com').context)).toThrow(
      'Too many authentication attempts.',
    );
    expect(internal.buckets.size).toBe(10_000);
  });

  it('fails closed without mutating an existing IP bucket when a subject bucket cannot fit', () => {
    const guard = createGuard();
    const internal = guard as unknown as {
      buckets: Map<string, { count: number; resetAt: number }>;
      nextPruneAt: number;
    };
    const existing = context('127.0.0.10', 'existing@example.com');
    expect(guard.canActivate(existing.context)).toBe(true);
    const ipEntry = [...internal.buckets.entries()].find(([key]) => key.startsWith('login:ip:'));
    expect(ipEntry).toBeDefined();
    const resetAt = Date.now() + 60_000;
    for (let index = internal.buckets.size; index < 10_000; index += 1) {
      internal.buckets.set(`active:${index}`, { count: 1, resetAt });
    }
    internal.nextPruneAt = resetAt;
    const countBeforeRejection = ipEntry?.[1].count;

    expect(() =>
      guard.canActivate(context('127.0.0.10', 'new-subject@example.com').context),
    ).toThrow('Too many authentication attempts.');
    expect(ipEntry?.[1].count).toBe(countBeforeRejection);
    expect(internal.buckets.size).toBe(10_000);
  });

  function createGuard(): TargetedRateLimitGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('login'),
    } as unknown as Reflector;
    return new TargetedRateLimitGuard(reflector, config);
  }
});

function context(
  ip: string,
  identifier: string,
): {
  context: ExecutionContext;
  headers: Map<string, unknown>;
} {
  const headers = new Map<string, unknown>();
  return {
    headers,
    context: {
      getClass: () => class TestController {},
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip, body: { identifier } }),
        getResponse: () => ({
          setHeader: (name: string, value: unknown) => headers.set(name, value),
        }),
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext,
  };
}
