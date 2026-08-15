import { apiRequest } from '@/lib/api/client';

import type { MiningClaimResult, MiningHistoryPage, MiningSession } from './contracts';

export const miningApi = {
  start() {
    return apiRequest<{ session: MiningSession }>('/mining/start', { method: 'POST' });
  },

  current(signal?: AbortSignal) {
    return apiRequest<{ session: MiningSession | null }>('/mining/current', { signal });
  },

  claim() {
    return apiRequest<MiningClaimResult>('/mining/claim', { method: 'POST' });
  },

  history(cursor?: string, signal?: AbortSignal) {
    const search = new URLSearchParams({ limit: '20' });
    if (cursor !== undefined) search.set('cursor', cursor);
    return apiRequest<MiningHistoryPage>(`/mining/history?${search.toString()}`, { signal });
  },
};
