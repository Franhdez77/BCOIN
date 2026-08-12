import type { Metadata } from 'next';

import { VerifyEmailForm } from '@/features/auth/components/verify-email-form';

export const metadata: Metadata = {
  title: 'Verify email | BichoCoin',
};

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
