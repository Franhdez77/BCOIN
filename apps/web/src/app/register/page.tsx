import type { Metadata } from 'next';

import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = {
  title: 'Create account | BichoCoin',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
