import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiHttpException } from '../../common/errors/api-http.exception';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { isPrismaCode } from '../../infrastructure/prisma/prisma-transaction';
import { normalizeUsername } from '../domain/username';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  status: string;
  createdAt: Date;
}

@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        emailVerifiedAt: true,
        status: true,
        createdAt: true,
      },
    });

    if (user === null) {
      throw new ApiHttpException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'The user could not be found.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerifiedAt !== null,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async updateUsername(userId: string, usernameInput: string): Promise<UserProfile> {
    const username = normalizeUsername(usernameInput);

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          username: username.display,
          usernameNormalized: username.normalized,
        },
      });
    } catch (error: unknown) {
      if (isPrismaCode(error, 'P2002')) {
        throw new ApiHttpException(
          HttpStatus.CONFLICT,
          'USERNAME_UNAVAILABLE',
          'That username is not available.',
        );
      }
      throw error;
    }

    return this.get(userId);
  }
}
