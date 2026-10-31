import { describe, expect, it } from 'vitest';
import { formatWeight, healthEventInputSchema, isTreatmentActive, parseKilograms, treatmentInputSchema } from './health';

describe('poids', () => {
  it('accepte virgule et point, refuse le reste', () => {
    expect(parseKilograms('23,4')).toBe(23400);
    expect(parseKilograms(' 9.05 ')).toBe(9050);
    expect(parseKilograms('vingt')).toBeNull();
    expect(parseKilograms('-3')).toBeNull();
  });
  it('affiche en kilogrammes à la française', () => {
    expect(formatWeight(23400)).toBe('23,4 kg');
    expect(formatWeight(9000)).toBe('9 kg');
  });
});

describe('soins et traitements', () => {
  it('refuse une échéance antérieure au soin', () => {
    const base = { kind: 'vaccin', date: '2026-03-01', title: 'CHPPiL' };
    expect(healthEventInputSchema.safeParse({ ...base, nextDueDate: '2027-03-01' }).success).toBe(true);
    expect(healthEventInputSchema.safeParse({ ...base, nextDueDate: '2026-02-01' }).success).toBe(false);
    expect(healthEventInputSchema.parse({ ...base, nextDueDate: '', contactId: '' })).toMatchObject({ nextDueDate: null, contactId: null });
  });
  it('refuse une fin de traitement avant son début et sait s’il est en cours', () => {
    expect(treatmentInputSchema.safeParse({ name: 'X', startDate: '2026-03-10', endDate: '2026-03-01' }).success).toBe(false);
    expect(isTreatmentActive({ endDate: null }, '2026-10-31')).toBe(true);
    expect(isTreatmentActive({ endDate: '2026-10-31' }, '2026-10-31')).toBe(true);
    expect(isTreatmentActive({ endDate: '2026-10-30' }, '2026-10-31')).toBe(false);
  });
});
