import type {
  Album,
  AlbumInput,
  Memory,
  MemoryCreateInput,
  MemoryReminderSettings,
  MemoryUpdateInput,
  Moment,
  ShareCreateInput,
  ShareLink,
  SpecialDate,
  SpecialDateInput,
} from '@eko/shared';
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
      void queryClient.invalidateQueries({ queryKey: albumsKey });
    },
  });
}

// ---------------------------------------------------------------- Albums

export const albumsKey = ['/albums'] as const;

export function useAlbums(enabled = true) {
  return useQuery({ queryKey: albumsKey, queryFn: () => api<Album[]>('/albums'), enabled });
}

/** Après un changement d'album : la liste des albums et l'appartenance des souvenirs. */
function useRefreshAlbums() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: albumsKey }), queryClient.invalidateQueries({ queryKey: memoriesKey })]);
}

export function useSaveAlbum() {
  const refresh = useRefreshAlbums();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AlbumInput }) =>
      id ? api<Album>(`/albums/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }) : api<Album>('/albums', { method: 'POST', body: input }),
    onSuccess: () => refresh(),
  });
}

export function useDeleteAlbum() {
  const refresh = useRefreshAlbums();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/albums/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  });
}

export function useAlbumMembers() {
  const refresh = useRefreshAlbums();
  return useMutation({
    mutationFn: ({ id, add = [], remove = [] }: { id: string; add?: string[]; remove?: string[] }) =>
      api<Album>(`/albums/${encodeURIComponent(id)}/memories`, { method: 'PUT', body: { add, remove } }),
    onSuccess: () => refresh(),
  });
}

export function useAlbumCover() {
  const refresh = useRefreshAlbums();
  return useMutation({
    mutationFn: ({ id, memoryId }: { id: string; memoryId: string | null }) =>
      api<Album>(`/albums/${encodeURIComponent(id)}/cover`, { method: 'PUT', body: { memoryId } }),
    onSuccess: () => refresh(),
  });
}

// ---------------------------------------------------------------- Partage

const sharesKey = (albumId: string) => ['/albums', albumId, 'shares'] as const;

export function useShares(albumId: string) {
  return useQuery({ queryKey: sharesKey(albumId), queryFn: () => api<ShareLink[]>(`/albums/${encodeURIComponent(albumId)}/shares`) });
}

export function useShareActions(albumId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: sharesKey(albumId) }), queryClient.invalidateQueries({ queryKey: albumsKey })]);
  return {
    create: useMutation({
      mutationFn: (input: ShareCreateInput) =>
        api<ShareLink>(`/albums/${encodeURIComponent(albumId)}/shares`, { method: 'POST', body: input }),
      onSuccess: () => refresh(),
    }),
    revoke: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/shares/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
      onSuccess: () => refresh(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      onSuccess: () => refresh(),
    }),
  };
}

// ---------------------------------------------------------------- Rappels souvenirs

export interface MomentsResponse {
  settings: MemoryReminderSettings;
  specialDates: SpecialDate[];
  today: Moment[];
  upcoming: { title: string; on: string; years: number }[];
}

export const momentsKey = ['/memories/moments'] as const;

export function useMoments(enabled = true) {
  return useQuery({ queryKey: momentsKey, queryFn: () => api<MomentsResponse>('/memories/moments'), enabled });
}

export function useMomentActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: momentsKey });
  return {
    settings: useMutation({
      mutationFn: (input: MemoryReminderSettings) => api<MemoryReminderSettings>('/memories/reminders', { method: 'PUT', body: input }),
      onSuccess: () => refresh(),
    }),
    addDate: useMutation({
      mutationFn: (input: SpecialDateInput) => api<SpecialDate>('/special-dates', { method: 'POST', body: input }),
      onSuccess: () => refresh(),
    }),
    removeDate: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/special-dates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      onSuccess: () => refresh(),
    }),
  };
}
