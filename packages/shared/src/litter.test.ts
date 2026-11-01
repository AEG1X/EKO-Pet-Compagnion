import { describe, expect, it } from 'vitest';
import { type Litter, homeDateTooEarly, litterMilestones, parentInputSchema } from './litter';

const base: Litter = { matingDate: null, matingApprox: false, ultrasoundResult: null, homeDate: null, notes: null };

describe('jalons de la portée', () => {
  it('ne propose rien sans saillie ni naissance', () => {
    expect(litterMilestones(null, null)).toEqual([]);
    expect(litterMilestones(base, null)).toEqual([]);
  });

  it('estime échographie, naissance et arrivée à partir de la saillie', () => {
    expect(litterMilestones({ ...base, matingDate: '2026-12-10' }, null)).toEqual([
      { kind: 'saillie', date: '2026-12-10', estimated: false, approximate: false },
      { kind: 'echographie', date: '2027-01-07', estimated: true, approximate: false },
      { kind: 'naissance', date: '2027-02-11', estimated: true, approximate: false },
      { kind: 'arrivee', date: '2027-04-08', estimated: true, approximate: false },
    ]);
  });

  it('garde une saillie approximative comme approximative', () => {
    const list = litterMilestones({ ...base, matingDate: '2026-12-15', matingApprox: true }, null);
    expect(list.every((m) => m.approximate && m.estimated)).toBe(true);
  });

  it('remplace les estimations par les dates réelles', () => {
    const list = litterMilestones({ ...base, matingDate: '2026-12-10', homeDate: '2027-04-17' }, '2027-02-09');
    expect(list).toEqual([
      { kind: 'saillie', date: '2026-12-10', estimated: false, approximate: false },
      { kind: 'naissance', date: '2027-02-09', estimated: false, approximate: false },
      { kind: 'arrivee', date: '2027-04-17', estimated: false, approximate: false },
    ]);
  });

  it('signale une arrivée avant 8 semaines', () => {
    expect(homeDateTooEarly({ ...base, homeDate: '2027-03-20' }, '2027-02-09')).toBe(true);
    expect(homeDateTooEarly({ ...base, homeDate: '2027-04-06' }, '2027-02-09')).toBe(false);
    expect(homeDateTooEarly({ ...base, homeDate: '2027-03-20' }, null)).toBe(false);
  });
});

describe('fiche d’un parent', () => {
  it('n’accepte que des liens web', () => {
    expect(parentInputSchema.safeParse({ name: 'Tala', pedigreeUrl: 'https://lof.example/1' }).success).toBe(true);
    expect(parentInputSchema.parse({ name: 'Tala', pedigreeUrl: '' }).pedigreeUrl).toBeNull();
    expect(parentInputSchema.safeParse({ name: 'Tala', pedigreeUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(parentInputSchema.safeParse({ name: 'Tala', pedigreeUrl: 'pas une adresse' }).success).toBe(false);
  });
});
