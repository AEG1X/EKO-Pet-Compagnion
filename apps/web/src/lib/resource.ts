import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Accès standard à une ressource de liste de l'API (GET, POST, PUT /:id, DELETE /:id).
 * `related` : autres listes à rafraîchir après une écriture (ex. : le tableau de bord).
 */
export function resource<T, I>(path: string, related: QueryKey[] = []) {
  const key: QueryKey = [path];
  const refresh = (queryClient: ReturnType<typeof useQueryClient>) =>
    Promise.all([key, ...related].map((k) => queryClient.invalidateQueries({ queryKey: k })));

  return {
    key,
    useList: () => useQuery({ queryKey: key, queryFn: () => api<T[]>(path) }),
    useSave: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ id, input }: { id?: string; input: I }) =>
          id
            ? api<T>(`${path}/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
            : api<T>(path, { method: 'POST', body: input }),
        onSuccess: () => refresh(queryClient),
      });
    },
    useRemove: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (id: string) => api<{ ok: true }>(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        onSuccess: () => refresh(queryClient),
      });
    },
  };
}
