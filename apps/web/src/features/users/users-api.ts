import { apiRequest } from '@/lib/api/client';

import type { UserProfile } from './contracts';

export const usersApi = {
  me(signal?: AbortSignal) {
    return apiRequest<{ user: UserProfile }>('/users/me', { signal });
  },

  updateProfile(input: { username: string }) {
    return apiRequest<{ user: UserProfile }>('/users/me', {
      body: input,
      method: 'PATCH',
    });
  },
};
