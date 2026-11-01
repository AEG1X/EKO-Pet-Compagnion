import type { Litter, LitterInput, Parent, ParentInput, ParentRole, ParentTestInput } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { storageKey } from '../documents/queries';

export const litterKey = ['litter'] as const;
export const parentsKey = ['parents'] as const;

export function useLitter(enabled = true) {
  return useQuery({ queryKey: litterKey, queryFn: () => api<Litter | null>('/litter'), enabled });
}

export function useSaveLitter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LitterInput) => api<Litter>('/litter', { method: 'PUT', body: input }),
    onSuccess: (litter) => queryClient.setQueryData(litterKey, litter),
  });
}

export function useParents() {
  return useQuery({ queryKey: parentsKey, queryFn: () => api<Parent[]>('/parents') });
}

/** Remplace un parent dans la liste en cache (la mère d'abord). */
function useStoreParent() {
  const queryClient = useQueryClient();
  return (parent: Parent) =>
    queryClient.setQueryData<Parent[]>(parentsKey, (list = []) =>
      [...list.filter((p) => p.role !== parent.role), parent].sort((a, b) => (a.role === 'mere' ? -1 : b.role === 'mere' ? 1 : 0)),
    );
}

export function useSaveParent() {
  const store = useStoreParent();
  return useMutation({
    mutationFn: ({ role, input }: { role: ParentRole; input: ParentInput }) =>
      api<Parent>(`/parents/${role}`, { method: 'PUT', body: input }),
    onSuccess: store,
  });
}

export function useDeleteParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: ParentRole) => api<{ ok: true }>(`/parents/${role}`, { method: 'DELETE' }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: parentsKey }),
        queryClient.invalidateQueries({ queryKey: storageKey }),
      ]),
  });
}

/** Ajoute, remplace (file) ou retire (null) la photo d'un parent. */
export function useSetParentPhoto() {
  const store = useStoreParent();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, photo }: { role: ParentRole; photo: { file: Blob; name: string } | null }) => {
      const fileId = photo ? (await uploadFile(photo.file, photo.name)).id : null;
      return api<Parent>(`/parents/${role}/photo`, { method: 'PUT', body: { fileId } });
    },
    onSuccess: store,
    onSettled: () => queryClient.invalidateQueries({ queryKey: storageKey }),
  });
}

export function useSaveParentTest() {
  const store = useStoreParent();
  return useMutation({
    mutationFn: ({ role, id, input }: { role: ParentRole; id?: string; input: ParentTestInput }) =>
      id
        ? api<Parent>(`/parent-tests/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
        : api<Parent>(`/parents/${role}/tests`, { method: 'POST', body: input }),
    onSuccess: store,
  });
}

export function useDeleteParentTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/parent-tests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: parentsKey }),
  });
}
