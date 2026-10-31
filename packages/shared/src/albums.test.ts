import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEMORY_REMINDERS,
  exportPath,
  memoryMoments,
  monthsBetween,
  shareCreateSchema,
  shareStatus,
  splitIntoParts,
  upcomingMoments,
} from './albums';
import { crc32, utf8, zipSync } from './zip';

const base = { dogName: 'Eko', birthDate: '2026-12-20', specialDates: [], memoryDates: [], settings: DEFAULT_MEMORY_REMINDERS };

describe('rappels souvenirs', () => {
  it('fête l’âge en mois puis l’anniversaire', () => {
    expect(memoryMoments(base, '2027-03-20').map((m) => m.title)).toEqual(['Eko a 3 mois aujourd’hui · une photo pour la frise ?']);
    expect(memoryMoments(base, '2027-03-21')).toEqual([]);
    expect(memoryMoments(base, '2027-12-20')).toMatchObject([{ kind: 'birthday', count: 1 }]);
    // Après deux ans, plus de rappel mensuel.
    expect(memoryMoments(base, '2029-01-20')).toEqual([]);
    expect(memoryMoments({ ...base, settings: { ...DEFAULT_MEMORY_REMINDERS, monthly: false } }, '2027-03-20')).toEqual([]);
  });

  it('compte les mois révolus, fins de mois comprises', () => {
    expect(monthsBetween('2027-01-31', '2027-02-28')).toBe(1);
    expect(monthsBetween('2027-01-31', '2027-02-27')).toBe(0);
    expect(memoryMoments({ ...base, birthDate: '2027-01-31' }, '2027-02-28')).toMatchObject([{ kind: 'monthly', count: 1 }]);
  });

  it('rappelle les dates spéciales et les souvenirs du même jour', () => {
    const moments = memoryMoments(
      {
        ...base,
        birthDate: null,
        specialDates: [{ id: 's', title: 'Arrivée à la maison', date: '2027-02-14' }],
        memoryDates: ['2027-02-14', '2027-02-14', '2028-02-14', '2029-02-14', '2028-02-15'],
      },
      '2029-02-14',
    );
    expect(moments.map((m) => m.title)).toEqual([
      'Arrivée à la maison : il y a 2 ans',
      'Il y a 1 an : 1 souvenir',
      'Il y a 2 ans : 2 souvenirs',
    ]);
  });

  it('fête un 29 février le 28 les autres années', () => {
    expect(memoryMoments({ ...base, birthDate: '2028-02-29' }, '2029-02-28')).toMatchObject([{ kind: 'birthday' }]);
    expect(upcomingMoments('2028-02-29', [], '2029-02-01')).toEqual([{ title: 'Anniversaire', on: '2029-02-28', years: 1 }]);
  });
});

describe('partage', () => {
  it('valide la durée et l’état d’un lien', () => {
    expect(shareCreateSchema.safeParse({ label: 'Famille', days: 7 }).success).toBe(true);
    expect(shareCreateSchema.safeParse({ label: 'Famille', days: 12 }).success).toBe(false);
    expect(shareCreateSchema.safeParse({ label: '', days: null }).success).toBe(false);
    expect(shareStatus({ revokedAt: null, expiresAt: null })).toBe('active');
    expect(shareStatus({ revokedAt: null, expiresAt: 10 }, 11)).toBe('expired');
    expect(shareStatus({ revokedAt: 5, expiresAt: null })).toBe('revoked');
  });
});

describe('export', () => {
  it('nomme les fichiers par date, sans caractère risqué', () => {
    expect(
      exportPath({ id: 'abcdef123', takenDate: '2026-12-24', takenTime: '18:30', caption: 'Premier Noël / sapin !', contentType: 'image/jpeg', name: 'IMG.JPG' }),
    ).toBe('2026/12/2026-12-24_18h30_Premier-Noel-sapin_abcdef.jpg');
    expect(exportPath({ id: 'xyz789', takenDate: '2027-01-02', takenTime: null, caption: null, contentType: 'video/quicktime', name: null })).toBe(
      '2027/01/2027-01-02_xyz789.mov',
    );
  });

  it('coupe l’export en lots sans couper un fichier', () => {
    expect(splitIntoParts([{ size: 6 }, { size: 5 }, { size: 4 }, { size: 20 }], 10).map((p) => p.length)).toEqual([1, 2, 1]);
  });

  it('écrit une archive ZIP valide', () => {
    expect([...utf8('é🐾')]).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x90, 0xbe]);
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
    const a = utf8('12345');
    expect(crc32(utf8('6789'), crc32(a))).toBe(0xcbf43926);
    const zip = zipSync([
      { path: 'souvenirs.json', data: utf8('{}') },
      { path: '2026/12/été.jpg', data: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.byteLength - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const centralOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(centralOffset, true)).toBe(0x02014b50);
  });
});
