import * as argon2 from 'argon2';

import { PasswordHasher, PasswordPolicyError } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes and verifies passwords with the centralized Argon2id policy', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    const salt = hash.split('$')[4];
    expect(salt).toBeDefined();
    expect(Buffer.from(salt ?? '', 'base64').byteLength).toBe(16);
    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'incorrect password')).resolves.toBe(false);
    expect(argon2.needsRehash(hash, { memoryCost: 19_456, timeCost: 2, parallelism: 1 })).toBe(
      false,
    );
  });

  it.each(['short', 'x'.repeat(129), '😀'.repeat(129)])(
    'rejects passwords outside character or UTF-8 byte bounds',
    (password) => {
      expect(() => hasher.hash(password)).toThrow(PasswordPolicyError);
    },
  );

  it('allows Unicode and whitespace without composition rules', async () => {
    await expect(hasher.hash('frase larga ñandú ⚽')).resolves.toMatch(/^\$argon2id\$/);
  });
});
