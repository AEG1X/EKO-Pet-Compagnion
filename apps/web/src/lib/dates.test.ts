import { describe, expect, it } from 'vitest';
import { daysUntil, formatDate, relativeDays } from './dates';

describe('dates calendaires', () => {
  it('compte les jours sans décalage de fuseau', () => {
    expect(daysUntil('2026-11-10', '2026-10-31')).toBe(10);
    expect(daysUntil('2026-03-29', '2026-03-28')).toBe(1);
  });
  it('formule l’échéance en français', () => {
    expect(relativeDays('2026-10-31', '2026-10-31')).toBe('aujourd’hui');
    expect(relativeDays('2026-11-01', '2026-10-31')).toBe('demain');
    expect(relativeDays('2026-10-28', '2026-10-31')).toBe('en retard de 3 jours');
    expect(formatDate('2026-03-01')).toBe('1 mars 2026');
  });
});
