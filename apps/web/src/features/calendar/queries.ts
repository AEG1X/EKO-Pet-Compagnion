import type { CalendarFeedCreated, CalendarFeedStatus, Reminder, ReminderInput } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { resource } from '../../lib/resource';

export const reminders = resource<Reminder, ReminderInput>('/reminders');

/** Fait / pas fait : un rappel récurrent avance à sa prochaine occurrence. */
export function useToggleDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api<Reminder>(`/reminders/${encodeURIComponent(id)}/done`, { method: done ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reminders.key }),
  });
}

const feedKey = ['/calendar-feed'] as const;

export function useCalendarFeed() {
  return useQuery({ queryKey: feedKey, queryFn: () => api<CalendarFeedStatus>('/calendar-feed') });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<CalendarFeedCreated>('/calendar-feed', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
}

export function useRevokeFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/calendar-feed', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
}
