import type { Metadata } from 'next';

import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = {
  title: 'Sign in | BichoCoin',
};

interface LoginPageProps {
  searchParams: Promise<{
    next?: string | string[];
    reset?: string | string[];
  }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  return (
    <LoginForm
      initialNext={firstValue(parameters.next)}
      resetCompleted={firstValue(parameters.reset) === 'success'}
    />
  );
}
