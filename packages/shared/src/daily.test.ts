import { describe, expect, it } from 'vitest';
import { expenseInputSchema, feedingPlanInputSchema, formatEuros, parseEuros } from './daily';

describe('montants', () => {
  it('lit les saisies françaises', () => {
    expect(parseEuros('12,5')).toBe(1250);
    expect(parseEuros('1 234,56 €')).toBe(123456);
    expect(parseEuros('12.345')).toBeNull();
    expect(parseEuros('douze')).toBeNull();
  });
  it('affiche en euros', () => {
    expect(formatEuros(123456).replace(/\s/g, ' ')).toBe('1 234,56 €');
  });
  it('refuse un montant nul', () => {
    expect(expenseInputSchema.safeParse({ date: '2026-10-01', amountCents: 0, category: 'sante', label: 'X' }).success).toBe(false);
  });
});

describe('alimentation', () => {
  it('refuse une fin avant le début et convertit les vides', () => {
    expect(feedingPlanInputSchema.safeParse({ food: 'X', startDate: '2026-10-01', endDate: '2026-09-01' }).success).toBe(false);
    expect(feedingPlanInputSchema.parse({ food: 'X', startDate: '2026-10-01', endDate: '' })).toMatchObject({ endDate: null, dailyGrams: null });
  });
});
