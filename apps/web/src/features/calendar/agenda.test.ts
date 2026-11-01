import type { HealthEvent, Reminder } from '@eko/shared';
import { describe, expect, it } from 'vitest';
import { agendaItems, monthGrid } from './agenda';

const reminder = (over: Partial<Reminder>): Reminder => ({
  id: 'r',
  title: 'Brossage',
  kind: 'toilettage',
  date: '2026-10-25',
  time: null,
  recurrence: 'none',
  notifyDaysBefore: 1,
  healthEventId: null,
  notes: null,
  doneDate: null,
  ...over,
});

const event: HealthEvent = {
  id: 'e',
  kind: 'vaccin',
  date: '2025-11-20',
  title: 'CHPPiL',
  contactId: null,
  contactName: null,
  nextDueDate: '2026-11-20',
  notes: null,
};

describe('agendaItems', () => {
  it('montre un rappel en retard une seule fois, puis ses occurrences à venir', () => {
    const items = agendaItems([reminder({ recurrence: 'weekly' })], [], '2026-10-31', '2026-11-15', '2026-10-31', {
      includeOverdue: true,
    });
    expect(items.map((i) => [i.date, i.overdue])).toEqual([
      ['2026-10-25', true],
      ['2026-11-01', false],
      ['2026-11-08', false],
      ['2026-11-15', false],
    ]);
  });

  it('ne montre que la prochaine occurrence avec nextOnly', () => {
    const weekly = reminder({ recurrence: 'weekly', date: '2026-11-04' });
    const late = reminder({ id: 'l', recurrence: 'weekly', date: '2026-10-28' });
    const items = agendaItems([weekly, late], [], '2026-10-31', '2026-12-31', '2026-10-31', { includeOverdue: true, nextOnly: true });
    expect(items.map((i) => [i.reminder!.id, i.date])).toEqual([
      ['l', '2026-10-28'],
      ['r', '2026-11-04'],
    ]);
  });

  it('ignore les rappels faits et ajoute les échéances de santé', () => {
    const items = agendaItems([reminder({ doneDate: '2026-10-25' })], [event], '2026-11-01', '2026-11-30', '2026-10-31');
    expect(items.map((i) => i.title)).toEqual(['Vaccin à refaire : CHPPiL']);
  });
});

describe('échéances en retard', () => {
  it('garde une échéance de santé dépassée parmi les retards', () => {
    const items = agendaItems([], [{ ...event, nextDueDate: '2026-10-01' }], '2026-10-31', '2026-12-31', '2026-10-31', {
      includeOverdue: true,
    });
    expect(items).toMatchObject([{ type: 'echeance', date: '2026-10-01', overdue: true }]);
  });
});

describe('monthGrid', () => {
  it('commence un lundi et couvre des semaines complètes', () => {
    const grid = monthGrid(2026, 10); // novembre 2026 : le 1er est un dimanche
    expect(grid[0]).toBe('2026-10-26');
    expect(grid[6]).toBe('2026-11-01');
    expect(grid).toHaveLength(42);
    expect(grid.at(-1)).toBe('2026-12-06');
  });
});

describe('jalons de la portée dans l’agenda', () => {
  const milestones = [
    { kind: 'saillie' as const, date: '2026-12-15', estimated: true, approximate: true },
    { kind: 'naissance' as const, date: '2027-02-16', estimated: true, approximate: true },
    { kind: 'arrivee' as const, date: '2027-04-13', estimated: false, approximate: false },
  ];

  it('ajoute les jalons à venir, avec un titre qui dit s’il s’agit d’une estimation', () => {
    const items = agendaItems([], [], '2027-01-01', '2027-12-31', '2027-01-01', { milestones });
    expect(items.map((i) => [i.type, i.title])).toEqual([
      ['portee', 'Naissance (vers février 2027)'],
      ['portee', 'Arrivée à la maison'],
    ]);
  });

  it('montre aussi les jalons passés dans la grille du mois', () => {
    const items = agendaItems([], [], '2026-12-01', '2026-12-31', '2027-01-01', { includePastCare: true, milestones });
    expect(items.map((i) => i.title)).toEqual(['Saillie de la mère (vers décembre 2026)']);
  });
});
