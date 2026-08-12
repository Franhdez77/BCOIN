import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

import {
  PASSWORD_MAXIMUM_BYTES,
  PASSWORD_MAXIMUM_CHARACTERS,
  PASSWORD_MINIMUM_CHARACTERS,
} from '../domain/auth.constants';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  version: 0x13,
} satisfies argon2.HashOptions;
const ARGON_SALT_BYTES = 16;

export class PasswordPolicyError extends Error {
  constructor() {
    super('Password does not satisfy the configured policy.');
    this.name = 'PasswordPolicyError';
  }
}

@Injectable()
export class PasswordHasher {
  assertPolicy(password: string): void {
    const characters = Array.from(password).length;
    if (
      characters < PASSWORD_MINIMUM_CHARACTERS ||
      characters > PASSWORD_MAXIMUM_CHARACTERS ||
      Buffer.byteLength(password, 'utf8') > PASSWORD_MAXIMUM_BYTES
    ) {
      throw new PasswordPolicyError();
    }
  }

  hash(password: string): Promise<string> {
    this.assertPolicy(password);
    return argon2.hash(password, {
      ...ARGON_OPTIONS,
      salt: randomBytes(ARGON_SALT_BYTES),
      raw: false,
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON_OPTIONS);
  }
}
