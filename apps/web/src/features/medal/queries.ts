import type { MedalSettingsInput, MedalStatus, PublicMedal } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const medalKey = ['/medal'] as const;
const previewKey = ['/medal/preview'] as const;

export function useMedal() {
  return useQuery({ queryKey: medalKey, queryFn: () => api<MedalStatus>('/medal') });
}

export function usePublicPreview() {
  return useQuery({ queryKey: previewKey, queryFn: () => api<PublicMedal>('/medal/preview') });
}

function useMedalMutation<V>(mutationFn: (vars: V) => Promise<MedalStatus>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (status) => {
      queryClient.setQueryData(medalKey, status);
      void queryClient.invalidateQueries({ queryKey: previewKey });
    },
  });
}

export function useSaveMedalSettings() {
  return useMedalMutation((input: MedalSettingsInput) => api<MedalStatus>('/medal/settings', { method: 'PUT', body: input }));
}

/** Active la médaille, ou remplace son adresse (l'ancienne cesse de fonctionner). */
export function useNewMedalLink() {
  return useMedalMutation(() => api<MedalStatus>('/medal/link', { method: 'POST' }));
}

export function useDeactivateMedal() {
  return useMedalMutation(() => api<MedalStatus>('/medal/link', { method: 'DELETE' }));
}
