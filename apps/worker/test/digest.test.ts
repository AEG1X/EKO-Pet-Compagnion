import type { HealthEvent, Reminder } from '@eko/shared';
import { describe, expect, it } from 'vitest';
import { digestMessage, dueToday } from '../src/lib/digest';

const reminder = (over: Partial<Reminder>): Reminder => ({
  id: 'r',
  title: 'Brossage',
  kind: 'toilettage',
  date: '2026-11-01',
  time: null,
  recurrence: 'none',
  notifyDaysBefore: 0,
  healthEventId: null,
  notes: null,
  doneDate: null,
  ...over,
});

const vaccine = (nextDueDate: string): HealthEvent => ({
  id: 'e',
  kind: 'vaccin',
  date: '2025-11-08',
  title: 'CHPPiL',
  contactId: null,
  contactName: null,
  nextDueDate,
  notes: null,
});

describe('récapitulatif quotidien', () => {
  it('annonce chaque rappel le jour de sa prévenance', () => {
    const today = '2026-11-01';
    const items = dueToday(
      [
        reminder({}),
        reminder({ id: 'v', title: 'Contrôle', date: '2026-11-02', time: '18:30', notifyDaysBefore: 1 }),
        reminder({ id: 'w', title: 'Trop tôt', date: '2026-11-05', notifyDaysBefore: 1 }),
        reminder({ id: 'x', title: 'Hebdo', date: '2026-10-11', recurrence: 'weekly', notifyDaysBefore: 7 }),
        reminder({ id: 'y', title: 'Déjà fait', doneDate: '2026-10-30' }),
      ],
      [vaccine('2026-11-08')],
      today,
    );
    expect(items.map((i) => i.title)).toEqual(['Brossage', 'Contrôle', 'Hebdo', 'Vaccin à refaire : CHPPiL']);
    const message = digestMessage(items, today, 'Eko');
    expect(message.title).toBe('Eko · 4 rappels');
    expect(message.body.split('\n')).toEqual([
      'Aujourd’hui · Brossage',
      'Demain à 18 h 30 · Contrôle',
      'Le dimanche 8 novembre · Hebdo',
      'Le dimanche 8 novembre · Vaccin à refaire : CHPPiL',
    ]);
  });

  it('ne dit rien les jours sans rappel', () => {
    expect(dueToday([reminder({ date: '2026-11-03' })], [vaccine('2026-11-20')], '2026-11-01')).toEqual([]);
  });
});
