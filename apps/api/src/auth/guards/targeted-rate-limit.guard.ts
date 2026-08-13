import { createHmac } from 'node:crypto';

import { CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import type { EnvironmentVariables } from '../../config/environment';
import { RATE_LIMIT_POLICY_KEY } from '../domain/auth.constants';
import type { RateLimitPolicy } from '../decorators/rate-limit-policy.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_ACTIVE_RATE_LIMIT_BUCKETS = 10_000;
const PRUNE_INTERVAL_MILLISECONDS = 60_000;

@Injectable()
export class TargetedRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private nextPruneAt = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy === undefined) return true;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const settings = this.settings(policy);
    const subject = extractSubject(request);
    const now = Date.now();
    if (now >= this.nextPruneAt) this.prune(now);
    const ipKey = `${policy}:ip:${this.hash(request.ip ?? 'unknown-client')}`;
    const subjectKey = subject === '' ? undefined : `${policy}:subject:${this.hash(subject)}`;
    const missingIpBucket = !this.buckets.has(ipKey);
    const missingSubjectBucket = subjectKey !== undefined && !this.buckets.has(subjectKey);
    const requiredCapacity = Number(missingIpBucket) + Number(missingSubjectBucket);
    if (this.buckets.size + requiredCapacity > MAX_ACTIVE_RATE_LIMIT_BUCKETS) {
      this.reject(response, settings.maximum, settings.windowSeconds);
    }

    const ipBucket = this.increment(ipKey, now, settings.windowSeconds);
    this.setHeaders(response, settings.maximum, ipBucket, now);
    if (ipBucket.count > settings.maximum) {
      this.reject(response, settings.maximum, secondsUntil(ipBucket.resetAt, now));
    }

    if (subjectKey === undefined) return true;
    const subjectBucket = this.increment(subjectKey, now, settings.windowSeconds);
    const limitingBucket = subjectBucket.count > ipBucket.count ? subjectBucket : ipBucket;
    this.setHeaders(response, settings.maximum, limitingBucket, now);
    if (subjectBucket.count > settings.maximum) {
      this.reject(response, settings.maximum, secondsUntil(subjectBucket.resetAt, now));
    }
    return true;
  }

  private reject(response: Response, maximum: number, retryAfter: number): never {
    response.setHeader('RateLimit-Limit', maximum);
    response.setHeader('RateLimit-Remaining', 0);
    response.setHeader('RateLimit-Reset', retryAfter);
    response.setHeader('Retry-After', retryAfter);
    throw rateLimitExceeded();
  }

  private setHeaders(response: Response, maximum: number, bucket: Bucket, now: number): void {
    response.setHeader('RateLimit-Limit', maximum);
    response.setHeader('RateLimit-Remaining', Math.max(0, maximum - bucket.count));
    response.setHeader('RateLimit-Reset', secondsUntil(bucket.resetAt, now));
  }

  private increment(key: string, now: number, windowSeconds: number): Bucket {
    let bucket = this.buckets.get(key);
    if (bucket === undefined || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowSeconds * 1_000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket;
  }

  private settings(policy: RateLimitPolicy): { maximum: number; windowSeconds: number } {
    const prefix = {
      login: 'AUTH_LOGIN',
      register: 'AUTH_REGISTER',
      refresh: 'AUTH_REFRESH',
      passwordRecovery: 'AUTH_PASSWORD_RECOVERY',
      passwordReset: 'AUTH_PASSWORD_RESET',
      emailVerification: 'AUTH_EMAIL_VERIFICATION',
    }[policy];
    return {
      maximum: this.config.getOrThrow(`${prefix}_RATE_LIMIT_MAX` as keyof EnvironmentVariables),
      windowSeconds: this.config.getOrThrow(
        `${prefix}_RATE_LIMIT_WINDOW_SECONDS` as keyof EnvironmentVariables,
      ),
    };
  }

  private hash(value: string): string {
    return createHmac('sha256', this.config.getOrThrow('RATE_LIMIT_HMAC_SECRET', { infer: true }))
      .update(value)
      .digest('hex');
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    this.nextPruneAt = now + PRUNE_INTERVAL_MILLISECONDS;
  }
}

function secondsUntil(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

function rateLimitExceeded(): ApiHttpException {
  return new ApiHttpException(
    HttpStatus.TOO_MANY_REQUESTS,
    'RATE_LIMIT_EXCEEDED',
    'Too many authentication attempts.',
  );
}

function extractSubject(request: Request): string {
  if (typeof request.body !== 'object' || request.body === null) return '';
  const body = request.body as { email?: unknown; identifier?: unknown; token?: unknown };
  const value = body.identifier ?? body.email ?? body.token;
  return typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '';
}
