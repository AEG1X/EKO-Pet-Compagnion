import type { Dog, DocumentCreateInput, EkoDocument, StorageUsage } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { resource } from '../../lib/resource';
import { dogKey } from '../profile/queries';

export const storageKey = ['/storage'] as const;

// Toute écriture sur un document change aussi l'espace utilisé.
export const documents = resource<EkoDocument, DocumentCreateInput>('/documents', [storageKey]);

export function useStorage() {
  return useQuery({ queryKey: storageKey, queryFn: () => api<StorageUsage>('/storage') });
}

/** Envoie le fichier puis crée le document ; si la création échoue, l'envoi est annulé. */
export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, name, input }: { file: Blob; name: string; input: Omit<DocumentCreateInput, 'fileId'> }) => {
      const stored = await uploadFile(file, name);
      try {
        return await api<EkoDocument>('/documents', { method: 'POST', body: { ...input, fileId: stored.id } });
      } catch (error) {
        await api(`/files/${encodeURIComponent(stored.id)}`, { method: 'DELETE' }).catch(() => undefined);
        throw error;
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: documents.key }),
        queryClient.invalidateQueries({ queryKey: storageKey }),
      ]),
  });
}

/** Ajoute, remplace (file) ou retire (null) la photo du profil. */
export function useSetDogPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: { file: Blob; name: string } | null) => {
      const fileId = photo ? (await uploadFile(photo.file, photo.name)).id : null;
      return api<Dog>('/dog/photo', { method: 'PUT', body: { fileId } });
    },
    onSuccess: (dog) => queryClient.setQueryData(dogKey, dog),
    onSettled: () => queryClient.invalidateQueries({ queryKey: storageKey }),
  });
}
