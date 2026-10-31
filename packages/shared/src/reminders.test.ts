import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, nextOccurrence, occurrences, reminderInputSchema, upcomingDue } from './reminders';
import type { HealthEvent } from './health';

describe('dates calendaires', () => {
  it('ajoute des jours et des mois sans décalage', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // passage à l'heure d'été sans effet
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(daysBetween('2026-10-31', '2026-11-10')).toBe(10);
  });
});

describe('récurrences', () => {
  it('garde le jour d’ancrage d’un rappel mensuel', () => {
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextOccurrence('2026-10-31', 'none')).toBeNull();
    expect(nextOccurrence('2028-02-29', 'yearly')).toBe('2029-02-28');
  });

  it('liste les occurrences dans une période', () => {
    const base = { doneDate: null };
    expect(occurrences({ ...base, date: '2026-01-31', recurrence: 'monthly' }, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrences({ ...base, date: '2025-01-05', recurrence: 'weekly' }, '2026-10-01', '2026-10-20')).toEqual([
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
    ]);
    expect(occurrences({ ...base, date: '2020-01-01', recurrence: 'daily' }, '2026-10-30', '2026-11-01')).toHaveLength(3);
    expect(occurrences({ ...base, date: '2026-12-01', recurrence: 'none' }, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('reminderInputSchema', () => {
  it('accepte une heure facultative et refuse une heure invalide', () => {
    const base = { title: 'Toilettage', kind: 'toilettage', date: '2026-11-10', recurrence: 'none', notifyDaysBefore: 1 };
    expect(reminderInputSchema.parse({ ...base, time: '' }).time).toBeNull();
    expect(reminderInputSchema.parse({ ...base, time: '09:30' }).time).toBe('09:30');
    expect(reminderInputSchema.safeParse({ ...base, time: '25:00' }).success).toBe(false);
  });
});

describe('upcomingDue', () => {
  const event = (id: string, date: string, nextDueDate: string | null, title = 'Rage'): HealthEvent => ({
    id,
    kind: 'vaccin',
    date,
    title,
    contactId: null,
    contactName: null,
    nextDueDate,
    notes: null,
  });
  it('ne garde que la dernière échéance de chaque soin', () => {
    const list = upcomingDue(
      [event('a', '2025-03-01', '2026-03-01'), event('b', '2026-03-01', '2027-03-01'), event('c', '2026-01-01', '2026-01-02', 'Ancien')],
      '2026-10-31',
    );
    expect(list.map((e) => e.id)).toEqual(['b']);
  });
});
