import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { ApiResponse } from '../../common/request-context/request-context';
import { AccountVerificationService } from '../application/account-verification.service';
import { AuthenticationService } from '../application/authentication.service';
import { PasswordRecoveryService } from '../application/password-recovery.service';
import { SessionQueryService } from '../application/session-query.service';
import { CsrfExempt } from '../decorators/csrf-exempt.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { RateLimit } from '../decorators/rate-limit-policy.decorator';
import type { AuthenticatedPrincipal } from '../domain/auth.types';
import type { PublicUser } from '../domain/auth.types';
import { AuthCookieService } from '../infrastructure/auth-cookie.service';
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SessionIdDto,
  TokenDto,
} from './dto/auth.dto';
import {
  ApiAcceptedDataDto,
  ApiAuthenticationDataDto,
  ApiCsrfDataDto,
  ApiCurrentUserDataDto,
  ApiCsrfProtected,
  ApiEmailVerifiedDataDto,
  ApiEnvelopeResponse,
  ApiLogoutDataDto,
  ApiPasswordResetDataDto,
  ApiSessionRevokedDataDto,
  ApiSessionsDataDto,
} from './dto/auth-response.dto';
import { getRequestMetadata } from './request-metadata';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly verification: AccountVerificationService,
    private readonly authentication: AuthenticationService,
    private readonly recovery: PasswordRecoveryService,
    private readonly sessions: SessionQueryService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @CsrfExempt()
  @Get('csrf')
  @ApiOperation({ summary: 'Issue a short-lived CSRF token' })
  @ApiEnvelopeResponse(HttpStatus.OK, ApiCsrfDataDto)
  csrf(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    return { csrfToken: this.cookies.issueCsrf(response) };
  }

  @Public()
  @RateLimit('register')
  @Post('register')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.CREATED, ApiAcceptedDataDto)
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ accepted: true }> {
    return this.verification.register(
      dto.email,
      dto.username,
      dto.password,
      getRequestMetadata(request, response),
    );
  }

  @Public()
  @RateLimit('emailVerification')
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.OK, ApiEmailVerifiedDataDto)
  verifyEmail(
    @Body() dto: TokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ emailVerified: true }> {
    return this.verification.verify(dto.token, getRequestMetadata(request, response));
  }

  @Public()
  @RateLimit('emailVerification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('resend-verification')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.ACCEPTED, ApiAcceptedDataDto)
  resendVerification(
    @Body() dto: EmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ accepted: true }> {
    return this.verification.resend(dto.email, getRequestMetadata(request, response));
  }

  @Public()
  @RateLimit('login')
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.OK, ApiAuthenticationDataDto)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ user: PublicUser; csrfToken: string; accessExpiresAt: Date }> {
    const result = await this.authentication.login(
      dto.identifier,
      dto.password,
      getRequestMetadata(request, response),
    );
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      user: result.user,
      csrfToken: this.cookies.issueCsrf(response),
      accessExpiresAt: result.accessExpiresAt,
    };
  }

  @Public()
  @RateLimit('refresh')
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiCookieAuth('refreshCookie')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.OK, ApiAuthenticationDataDto)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ user: PublicUser; csrfToken: string; accessExpiresAt: Date }> {
    const result = await this.authentication.refresh(
      this.cookies.getRefreshToken(request),
      getRequestMetadata(request, response),
    );
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      user: result.user,
      csrfToken: this.cookies.issueCsrf(response),
      accessExpiresAt: result.accessExpiresAt,
    };
  }

  @Public()
  @RateLimit('refresh')
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiCookieAuth('refreshCookie')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.OK, ApiLogoutDataDto)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ loggedOut: true; csrfToken: string }> {
    const result = await this.authentication.logoutByRefresh(
      this.cookies.getRefreshToken(request),
      this.cookies.getAccessToken(request),
      response.locals.requestId ?? crypto.randomUUID(),
    );
    this.cookies.clearAuthenticationCookies(response);
    return { ...result, csrfToken: this.cookies.issueCsrf(response) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  @ApiCookieAuth('accessCookie')
  @ApiCsrfProtected()
  @ApiEnvelopeResponse(HttpStatus.OK, ApiLogoutDataDto)
  async logoutAll(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ loggedOut: true; csrfToken: string }> {
    const result = await this.authentication.logoutAll(
      principal.userId,
      response.locals.requestId ?? crypto.randomUUID(),
    );
    this.cookies.clearAuthenticationCookies(response);
    return { ...result, csrfToken: this.cookies.issueCsrf(response) };
  }

  @Public()
  @RateLimit('passwordRecovery')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.ACCEPTED, ApiAcceptedDataDto)
  forgotPassword(
    @Body() dto: EmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ accepted: true }> {
    return this.recovery.request(dto.email, getRequestMetadata(request, response));
  }

  @Public()
  @RateLimit('passwordReset')
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiCsrfProtected(true)
  @ApiEnvelopeResponse(HttpStatus.OK, ApiPasswordResetDataDto)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ passwordReset: true; csrfToken: string }> {
    const result = await this.recovery.reset(
      dto.token,
      dto.newPassword,
      getRequestMetadata(request, response),
    );
    this.cookies.clearAuthenticationCookies(response);
    return { ...result, csrfToken: this.cookies.issueCsrf(response) };
  }

  @Get('me')
  @ApiCookieAuth('accessCookie')
  @ApiEnvelopeResponse(HttpStatus.OK, ApiCurrentUserDataDto)
  me(@CurrentUser() principal: AuthenticatedPrincipal): Promise<{ user: PublicUser }> {
    return this.sessions.me(principal);
  }

  @Get('sessions')
  @ApiCookieAuth('accessCookie')
  @ApiEnvelopeResponse(HttpStatus.OK, ApiSessionsDataDto)
  listSessions(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): ReturnType<SessionQueryService['list']> {
    return this.sessions.list(principal);
  }

  @Delete('sessions/:sessionId')
  @ApiCookieAuth('accessCookie')
  @ApiCsrfProtected()
  @ApiEnvelopeResponse(HttpStatus.OK, ApiSessionRevokedDataDto)
  async revokeSession(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param() params: SessionIdDto,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<{ revoked: true; currentSessionRevoked: boolean }> {
    const currentSessionRevoked = params.sessionId === principal.sessionId;
    const result = await this.sessions.revoke(
      principal,
      params.sessionId,
      response.locals.requestId ?? crypto.randomUUID(),
    );
    if (currentSessionRevoked) this.cookies.clearAuthenticationCookies(response);
    return { ...result, currentSessionRevoked };
  }
}
