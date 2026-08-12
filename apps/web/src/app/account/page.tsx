import type { Metadata } from 'next';

import { AccountView } from '@/features/auth/components/account-view';

export const metadata: Metadata = {
  title: 'Your account | BichoCoin',
};

export default function AccountPage() {
  return <AccountView />;
}
