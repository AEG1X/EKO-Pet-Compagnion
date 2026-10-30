import { describe, expect, it } from 'vitest';
import { formatRecoveryCode, pinSchema, recoveryCodeSchema, sectionOrderSchema, settingsSchema } from './schemas';
import { DASHBOARD_SECTIONS } from './constants';

describe('pinSchema', () => {
  it('accepte exactement 6 chiffres', () => {
    expect(pinSchema.safeParse('123456').success).toBe(true);
    expect(pinSchema.safeParse('12345').success).toBe(false);
    expect(pinSchema.safeParse('12345a').success).toBe(false);
    expect(pinSchema.safeParse('1234567').success).toBe(false);
  });
});

describe('recoveryCodeSchema', () => {
  it('normalise tirets, espaces, casse et caractères ambigus', () => {
    expect(recoveryCodeSchema.parse('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(recoveryCodeSchema.parse('0o1l i234 5678')).toBe('001112345678');
  });
  it('refuse un code de mauvaise longueur', () => {
    expect(recoveryCodeSchema.safeParse('ABCD-EFGH').success).toBe(false);
  });
  it('se formate par groupes de 4', () => {
    expect(formatRecoveryCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });
});

describe('settingsSchema', () => {
  it("refuse un ordre de sections incomplet ou dupliqué", () => {
    expect(sectionOrderSchema.safeParse([...DASHBOARD_SECTIONS]).success).toBe(true);
    expect(sectionOrderSchema.safeParse(DASHBOARD_SECTIONS.slice(1)).success).toBe(false);
    const dup = [...DASHBOARD_SECTIONS];
    dup[1] = dup[0]!;
    expect(sectionOrderSchema.safeParse(dup).success).toBe(false);
  });
  it('refuse un accent inconnu', () => {
    expect(
      settingsSchema.safeParse({ theme: 'dark', accent: 'rose', sectionOrder: [...DASHBOARD_SECTIONS] }).success,
    ).toBe(false);
  });
});
