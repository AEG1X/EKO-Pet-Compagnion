import type { MeResponse } from '@eko/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';

export const meKey = ['me'] as const;

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api<{ needsSetup: boolean }>('/auth/setup/status'),
    staleTime: Infinity,
  });
}

/** Session courante, ou null si personne n'est connecté. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await api<MeResponse>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}
