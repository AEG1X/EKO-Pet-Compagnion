import type { HealthEvent, HealthEventInput, Treatment, TreatmentInput, WeightEntry, WeightInput } from '@eko/shared';
import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const eventsKey = ['health-events'] as const;
export const treatmentsKey = ['treatments'] as const;
export const weightsKey = ['weights'] as const;

export const useHealthEvents = () => useQuery({ queryKey: eventsKey, queryFn: () => api<HealthEvent[]>('/health-events') });
export const useTreatments = () => useQuery({ queryKey: treatmentsKey, queryFn: () => api<Treatment[]>('/treatments') });
export const useWeights = () => useQuery({ queryKey: weightsKey, queryFn: () => api<WeightEntry[]>('/weights') });

/** Enregistrement (création ou modification) d'une ressource de liste, puis rafraîchissement de la liste. */
function useSave<I, O>(path: string, key: QueryKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: I }) =>
      id
        ? api<O>(`${path}/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
        : api<O>(path, { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

function useRemove(path: string, key: QueryKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export const useSaveEvent = () => useSave<HealthEventInput, HealthEvent>('/health-events', eventsKey);
export const useRemoveEvent = () => useRemove('/health-events', eventsKey);
export const useSaveTreatment = () => useSave<TreatmentInput, Treatment>('/treatments', treatmentsKey);
export const useRemoveTreatment = () => useRemove('/treatments', treatmentsKey);
export const useSaveWeight = () => useSave<WeightInput, WeightEntry>('/weights', weightsKey);
export const useRemoveWeight = () => useRemove('/weights', weightsKey);
