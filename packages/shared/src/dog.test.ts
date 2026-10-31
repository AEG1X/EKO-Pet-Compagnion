import { describe, expect, it } from 'vitest';
import { contactInputSchema, dogInputSchema, formatAge, isoDateSchema } from './dog';

describe('isoDateSchema', () => {
  it('accepte une date réelle et refuse le reste', () => {
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('2023-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('29/02/2024').success).toBe(false);
  });
});

describe('dogInputSchema', () => {
  it('exige un nom et convertit les champs vides en null', () => {
    expect(dogInputSchema.safeParse({ name: '  ' }).success).toBe(false);
    const parsed = dogInputSchema.parse({ name: ' Eko ', breed: '', chipNumber: ' 250 ' });
    expect(parsed).toMatchObject({ name: 'Eko', breed: null, chipNumber: '250', sex: null, birthDate: null });
  });

  it('refuse une date de naissance dans le futur', () => {
    expect(dogInputSchema.safeParse({ name: 'Eko', birthDate: '2999-01-01' }).success).toBe(false);
  });
});

describe('contactInputSchema', () => {
  it('valide le téléphone et l’e-mail, vides acceptés', () => {
    expect(contactInputSchema.safeParse({ kind: 'veterinaire', name: 'Clinique', phone: '+33 1 23 45 67 89' }).success).toBe(true);
    expect(contactInputSchema.safeParse({ kind: 'veterinaire', name: 'Clinique', phone: 'appeler' }).success).toBe(false);
    expect(contactInputSchema.safeParse({ kind: 'veterinaire', name: 'Clinique', email: 'pas-un-mail' }).success).toBe(false);
    expect(contactInputSchema.parse({ kind: 'autre', name: 'X', phone: '', email: '' })).toMatchObject({ phone: null, email: null });
  });
});

describe('formatAge', () => {
  const today = new Date(2026, 9, 31);
  it('formate en années et mois', () => {
    expect(formatAge('2024-07-15', today)).toBe('2 ans et 3 mois');
    expect(formatAge('2025-10-31', today)).toBe('1 an');
    expect(formatAge('2026-04-30', today)).toBe('6 mois');
  });
  it('formate un chiot en semaines', () => {
    expect(formatAge('2026-09-19', today)).toBe('6 semaines');
  });
});
