import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { UserProfileService, type UserProfile } from '../application/user-profile.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/domain/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@ApiCookieAuth('accessCookie')
@Controller('users')
export class UsersController {
  constructor(private readonly profiles: UserProfileService) {}

  @Get('me')
  async me(@CurrentUser() principal: AuthenticatedPrincipal): Promise<{ user: UserProfile }> {
    return { user: await this.profiles.get(principal.userId) };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ user: UserProfile }> {
    return { user: await this.profiles.updateUsername(principal.userId, dto.username) };
  }
}
