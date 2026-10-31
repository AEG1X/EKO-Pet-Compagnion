import { z } from 'zod';
import { isoDateSchema } from './dog';
import { optionalInt, optionalText } from './fields';

// ---------------------------------------------------------------- Médias

/**
 * Photos et vidéos des souvenirs. Les originaux sont conservés tels quels ; un aperçu JPEG
 * léger est créé par le navigateur pour l'affichage (décision du cahier des charges, section 5).
 */
export const MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const MEDIA_TYPES_LABEL = 'photos (JPEG, PNG, WebP, HEIC, GIF) ou vidéos (MP4, MOV, WebM)';

/**
 * Plafond par fichier : le Worker gratuit accepte des corps de 100 Mo au plus.
 * Une vidéo plus lourde doit être raccourcie ou exportée en qualité réduite par le téléphone.
 */
export const MEDIA_MAX_BYTES = 95_000_000;
/** Aperçu : JPEG d'environ 640 px de large. */
export const PREVIEW_MAX_BYTES = 2_000_000;

export function isVideoType(type: string): boolean {
  return type.startsWith('video/');
}

/** Type réel d'un média d'après ses premiers octets (au moins 16), ou null. */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  // Famille ISO BMFF : « ftyp » puis la marque principale.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(brand)) return 'video/mp4';
  }
  return null;
}

// ---------------------------------------------------------------- Souvenirs

export const DATE_SOURCES = ['exif', 'video', 'file', 'manual'] as const;
export type DateSource = (typeof DATE_SOURCES)[number];
export const DATE_SOURCE_LABELS: Record<DateSource, string> = {
  exif: 'date de prise de vue',
  video: 'date d’enregistrement',
  file: 'date du fichier',
  manual: 'date corrigée',
};

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide')
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Empreinte SHA-256 (hexadécimal) du fichier d'origine : détecte les imports en double. */
export const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Empreinte invalide');

export const memoryCreateSchema = z.object({
  fileId: z.string().min(1).max(64),
  previewFileId: z.string().min(1).max(64).nullable().optional().transform((v) => v ?? null),
  contentHash: contentHashSchema,
  takenDate: isoDateSchema,
  takenTime: timeSchema,
  dateSource: z.enum(DATE_SOURCES),
  caption: optionalText(500),
  width: optionalInt(1, 100_000, 'Largeur invalide'),
  height: optionalInt(1, 100_000, 'Hauteur invalide'),
  durationSeconds: optionalInt(0, 86_400, 'Durée invalide'),
});
export type MemoryCreateInput = z.input<typeof memoryCreateSchema>;

export const memoryUpdateSchema = z.object({
  takenDate: isoDateSchema,
  takenTime: timeSchema,
  caption: optionalText(500),
  favorite: z.boolean(),
});
export type MemoryUpdateInput = z.input<typeof memoryUpdateSchema>;

export const memoryCheckSchema = z.object({ hashes: z.array(contentHashSchema).max(500) });

export interface Memory {
  id: string;
  kind: 'photo' | 'video';
  contentType: MediaType;
  size: number;
  name: string | null;
  takenDate: string;
  takenTime: string | null;
  dateSource: DateSource;
  caption: string | null;
  favorite: boolean;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Original, servi par le Worker. */
  url: string;
  /** Aperçu léger ; null si le navigateur n'a pas pu le créer (ex. HEIC hors Safari). */
  previewUrl: string | null;
  createdAt: string;
}

/** Regroupe les souvenirs par année puis par mois (AAAA-MM), du plus récent au plus ancien. */
export function groupByMonth<T extends { takenDate: string }>(items: T[]): { month: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => b.takenDate.localeCompare(a.takenDate))) {
    const month = item.takenDate.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  return [...groups].map(([month, list]) => ({ month, items: list }));
}

/** « 1:05 », « 12:30 », « 1:02:03 ». */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
