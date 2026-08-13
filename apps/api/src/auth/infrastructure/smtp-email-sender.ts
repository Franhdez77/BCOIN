import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { EnvironmentVariables } from '../../config/environment';
import type { EmailSender } from '../application/email-sender.port';

const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
const SMTP_GREETING_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 10_000;

@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    const user = config.getOrThrow('SMTP_USER', { infer: true });
    const password = config.getOrThrow('SMTP_PASSWORD', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow('SMTP_HOST', { infer: true }),
      port: config.getOrThrow('SMTP_PORT', { infer: true }),
      secure: config.getOrThrow('SMTP_SECURE', { infer: true }),
      requireTLS: config.getOrThrow('SMTP_REQUIRE_TLS', { infer: true }),
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      ...(user === '' ? {} : { auth: { user, pass: password } }),
    });
  }

  sendEmailVerification(recipient: string, token: string): Promise<void> {
    return this.send(recipient, 'Verify your BichoCoin email', 'verify-email', token);
  }

  sendPasswordReset(recipient: string, token: string): Promise<void> {
    return this.send(recipient, 'Reset your BichoCoin password', 'reset-password', token);
  }

  private async send(
    recipient: string,
    subject: string,
    route: string,
    token: string,
  ): Promise<void> {
    const baseUrl = this.config.getOrThrow('WEB_APP_BASE_URL', { infer: true });
    const url = `${baseUrl}/${route}#token=${encodeURIComponent(token)}`;
    await this.transporter.sendMail({
      from: this.config.getOrThrow('SMTP_FROM', { infer: true }),
      to: recipient,
      subject,
      text: `${subject}: ${url}`,
    });
  }
}
