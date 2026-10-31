import type { HealthEvent } from '@eko/shared';
import { describe, expect, it } from 'vitest';
import { upcomingDue } from './upcoming';

const base: HealthEvent = { id: '', kind: 'vaccin', date: '', title: 'Rage', contactId: null, contactName: null, nextDueDate: null, notes: null };

describe('upcomingDue', () => {
  it('ne garde que le dernier rappel de chaque soin, trié par échéance', () => {
    const events: HealthEvent[] = [
      { ...base, id: 'a', date: '2025-03-01', nextDueDate: '2026-03-01' },
      { ...base, id: 'b', date: '2026-03-02', nextDueDate: '2027-03-02' },
      { ...base, id: 'c', kind: 'antiparasitaire', title: 'Bravecto', date: '2026-09-01', nextDueDate: '2026-12-01' },
      { ...base, id: 'd', kind: 'consultation', title: 'Otite', date: '2026-06-01' },
    ];
    expect(upcomingDue(events, '2026-10-31').map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('écarte les retards de plus de 60 jours', () => {
    const events = [{ ...base, id: 'a', date: '2025-01-01', nextDueDate: '2026-08-01' }];
    expect(upcomingDue(events, '2026-10-31')).toEqual([]);
  });
});
