import type { Contact, ContactInput, Dog, DogInput } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const dogKey = ['dog'] as const;
export const contactsKey = ['contacts'] as const;

export function useDog() {
  return useQuery({ queryKey: dogKey, queryFn: () => api<Dog | null>('/dog') });
}

export function useContacts() {
  return useQuery({ queryKey: contactsKey, queryFn: () => api<Contact[]>('/contacts') });
}

export function useSaveDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DogInput) => api<Dog>('/dog', { method: 'PUT', body: input }),
    onSuccess: (dog) => queryClient.setQueryData(dogKey, dog),
  });
}

export function useSaveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ContactInput }) =>
      id
        ? api<Contact>(`/contacts/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
        : api<Contact>('/contacts', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKey }),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKey }),
  });
}
