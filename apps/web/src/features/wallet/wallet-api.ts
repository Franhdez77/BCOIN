import { apiRequest } from '@/lib/api/client';

import type { WalletSummary, WalletTransactionPage } from './contracts';

export const walletApi = {
  wallet(signal?: AbortSignal) {
    return apiRequest<{ wallet: WalletSummary }>('/wallet', { signal });
  },

  transactions(cursor?: string, signal?: AbortSignal) {
    const search = new URLSearchParams({ limit: '20' });
    if (cursor !== undefined) search.set('cursor', cursor);
    return apiRequest<WalletTransactionPage>(`/wallet/transactions?${search.toString()}`, {
      signal,
    });
  },
};
