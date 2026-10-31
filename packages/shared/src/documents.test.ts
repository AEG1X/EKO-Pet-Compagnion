import { describe, expect, it } from 'vitest';
import { documentCreateSchema, fileUrl, formatBytes, sniffFileType } from './documents';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
/** Octets d'une chaîne ASCII (le paquet partagé n'a pas les types DOM, donc pas TextEncoder). */
const ascii = (text: string) => new Uint8Array([...text].map((ch) => ch.charCodeAt(0)));

describe('sniffFileType', () => {
  it('reconnaît les formats acceptés à leurs premiers octets', () => {
    expect(sniffFileType(ascii('%PDF-1.4'))).toBe('application/pdf');
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffFileType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('refuse le reste, y compris du HTML ou du SVG', () => {
    expect(sniffFileType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffFileType(ascii('<!doctype html>'))).toBeNull();
    expect(sniffFileType(ascii('RIFF\0\0\0\0WAVEfmt '))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });
});

describe('formatBytes', () => {
  it('affiche des tailles lisibles en unités décimales', () => {
    expect(formatBytes(512)).toBe('512\u00a0o');
    expect(formatBytes(245_000)).toBe('245\u00a0Ko');
    expect(formatBytes(3_250_000)).toBe('3,3\u00a0Mo');
    expect(formatBytes(9_000_000_000)).toBe('9\u00a0Go');
  });
});

describe('documentCreateSchema', () => {
  it('exige un fichier et nettoie les champs facultatifs', () => {
    const base = { title: ' Ordonnance ', category: 'ordonnance', date: '2026-10-20' };
    expect(documentCreateSchema.safeParse(base).success).toBe(false);
    expect(documentCreateSchema.parse({ ...base, fileId: 'f1', notes: '', healthEventId: '' })).toEqual({
      title: 'Ordonnance',
      category: 'ordonnance',
      date: '2026-10-20',
      fileId: 'f1',
      notes: null,
      healthEventId: null,
    });
  });
});

describe('fileUrl', () => {
  it('pointe vers la route privée du Worker', () => {
    expect(fileUrl('abc')).toBe('/api/files/abc');
    expect(fileUrl('abc', true)).toBe('/api/files/abc?download=1');
  });
});
