export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  sendEmailVerification(recipient: string, token: string): Promise<void>;
  sendPasswordReset(recipient: string, token: string): Promise<void>;
}

