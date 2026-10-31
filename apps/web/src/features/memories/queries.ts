import type { Memory, MemoryCreateInput, MemoryUpdateInput } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { storageKey } from '../documents/queries';

export const memoriesKey = ['/memories'] as const;

export function useMemories(enabled = true) {
  return useQuery({ queryKey: memoriesKey, queryFn: () => api<Memory[]>('/memories'), enabled });
}

export function checkExisting(hashes: string[]) {
  return api<{ existing: string[] }>('/memories/check', { method: 'POST', body: { hashes } });
}

export function createMemory(input: MemoryCreateInput) {
  return api<Memory>('/memories', { method: 'POST', body: input });
}

export function useRefreshMemories() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: memoriesKey }), queryClient.invalidateQueries({ queryKey: storageKey })]);
}

export function useUpdateMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MemoryUpdateInput }) =>
      api<Memory>(`/memories/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Memory[]>(memoriesKey, (list) => list?.map((m) => (m.id === updated.id ? updated : m)));
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Memory[]>(memoriesKey, (list) => list?.filter((m) => m.id !== id));
      void queryClient.invalidateQueries({ queryKey: storageKey });
    },
  });
}
