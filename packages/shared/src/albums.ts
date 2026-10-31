import { z } from 'zod';
import { isoDateSchema } from './dog';
import { optionalText } from './fields';
import type { Memory } from './memories';
import { addMonths, daysBetween } from './reminders';

// ---------------------------------------------------------------- Albums

export const albumInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(80, '80 caractères maximum'),
  description: optionalText(500),
});
export type AlbumInput = z.input<typeof albumInputSchema>;

/** Ajout ou retrait de souvenirs d'un album, par lots. */
export const albumMembersSchema = z.object({
  add: z.array(z.string().min(1).max(64)).max(500).default([]),
  remove: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export type AlbumMembersInput = z.input<typeof albumMembersSchema>;

export const albumCoverSchema = z.object({ memoryId: z.string().min(1).max(64).nullable() });

export interface Album {
  id: string;
  name: string;
  description: string | null;
  count: number;
  /** Aperçu de couverture : celui choisi, sinon le souvenir le plus récent. */
  coverUrl: string | null;
  coverMemoryId: string | null;
  /** Période couverte (dates des souvenirs), ou null si l'album est vide. */
  firstDate: string | null;
  lastDate: string | null;
  /** Liens de partage encore valides. */
  activeShares: number;
  createdAt: string;
}

// ---------------------------------------------------------------- Partage

/** Durées proposées pour un lien de partage ; « null » = sans expiration (révocable à tout moment). */
export const SHARE_DURATIONS = [1, 7, 30, 90, null] as const;
export const SHARE_DURATION_LABELS: Record<string, string> = {
  '1': '24 heures',
  '7': '7 jours',
  '30': '30 jours',
  '90': '3 mois',
  null: 'Sans expiration',
};

export const shareCreateSchema = z.object({
  /** Pour qui : « Famille », « Mamie »… aide à savoir quel lien révoquer. */
  label: z.string().trim().min(1, 'Indique pour qui est ce lien').max(60, '60 caractères maximum'),
  days: z
    .number()
    .int()
    .refine((v) => (SHARE_DURATIONS as readonly (number | null)[]).includes(v), 'Durée invalide')
    .nullable(),
  /** Le visiteur peut télécharger les originaux (sinon : aperçus et lecture seulement). */
  allowDownload: z.boolean().default(false),
});
export type ShareCreateInput = z.input<typeof shareCreateSchema>;

/** Jeton d'un lien de partage : 128 bits aléatoires en base64url. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface ShareLink {
  id: string;
  albumId: string;
  label: string;
  url: string;
  allowDownload: boolean;
  status: ShareStatus;
  expiresAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/partage/${token}`;
}

export function shareStatus(row: { revokedAt: number | null; expiresAt: number | null }, now = Date.now()): ShareStatus {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt !== null && row.expiresAt <= now) return 'expired';
  return 'active';
}

// ---------------------------------------------------------------- Rappels souvenirs

export const specialDateInputSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(80, '80 caractères maximum'),
  date: isoDateSchema,
});
export type SpecialDateInput = z.input<typeof specialDateInputSchema>;

export interface SpecialDate {
  id: string;
  title: string;
  date: string;
}

export const memoryReminderSettingsSchema = z.object({
  /** Anniversaire du chien (date de naissance du profil). */
  birthday: z.boolean(),
  /** Chaque mois jusqu'à 2 ans : « Eko a 5 mois aujourd'hui ». */
  monthly: z.boolean(),
  /** Souvenirs pris le même jour les années précédentes. */
  onThisDay: z.boolean(),
  /** Dates spéciales (arrivée à la maison, première balade…), chaque année. */
  specialDates: z.boolean(),
});
export type MemoryReminderSettings = z.infer<typeof memoryReminderSettingsSchema>;
export const DEFAULT_MEMORY_REMINDERS: MemoryReminderSettings = { birthday: true, monthly: true, onThisDay: true, specialDates: true };

export type MomentKind = 'birthday' | 'monthly' | 'special' | 'on_this_day';

export interface Moment {
  kind: MomentKind;
  title: string;
  /** Date d'origine (naissance, date spéciale, jour des souvenirs). */
  date: string;
  /** Années écoulées (anniversaires, « ce jour-là »), mois pour « monthly ». */
  count: number;
}

const pluralize = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Mois révolus entre deux dates calendaires (31 janv. → 28 févr. compte pour un mois). */
export function monthsBetween(from: string, to: string): number {
  let months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  if (addMonths(from, months) > to) months -= 1;
  return months;
}

/** Même jour de l'année ; un 29 février se fête le 28 les années non bissextiles. */
function isAnniversary(date: string, today: string): boolean {
  if (date.slice(5) === today.slice(5)) return true;
  const year = Number(today.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return date.slice(5) === '02-29' && !leap && today.slice(5) === '02-28';
}

/**
 * Moments à célébrer aujourd'hui : anniversaire, âge en mois (les deux premières années),
 * dates spéciales et souvenirs du même jour les années précédentes.
 */
export function memoryMoments(
  input: {
    dogName: string;
    birthDate: string | null;
    specialDates: SpecialDate[];
    /** Dates (AAAA-MM-JJ) des souvenirs, doublons permis. */
    memoryDates: string[];
    settings: MemoryReminderSettings;
  },
  today: string,
): Moment[] {
  const { dogName, birthDate, settings } = input;
  const moments: Moment[] = [];
  if (birthDate && birthDate < today) {
    const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
    if (settings.birthday && years > 0 && isAnniversary(birthDate, today)) {
      moments.push({ kind: 'birthday', title: `Joyeux anniversaire ${dogName} : ${pluralize(years, 'an', 'ans')} aujourd’hui !`, date: birthDate, count: years });
    } else if (settings.monthly) {
      const months = monthsBetween(birthDate, today);
      if (months > 0 && months < 24 && addMonths(birthDate, months) === today) {
        moments.push({ kind: 'monthly', title: `${dogName} a ${months} mois aujourd’hui · une photo pour la frise ?`, date: birthDate, count: months });
      }
    }
  }
  if (settings.specialDates) {
    for (const s of input.specialDates) {
      const years = Number(today.slice(0, 4)) - Number(s.date.slice(0, 4));
      if (years > 0 && isAnniversary(s.date, today)) {
        moments.push({ kind: 'special', title: `${s.title} : il y a ${pluralize(years, 'an', 'ans')}`, date: s.date, count: years });
      }
    }
  }
  if (settings.onThisDay) {
    const byYear = new Map<string, number>();
    for (const d of input.memoryDates) {
      if (d < today && isAnniversary(d, today) && d.slice(0, 4) !== today.slice(0, 4)) byYear.set(d, (byYear.get(d) ?? 0) + 1);
    }
    for (const [date, n] of [...byYear].sort((a, b) => b[0].localeCompare(a[0]))) {
      const years = Number(today.slice(0, 4)) - Number(date.slice(0, 4));
      moments.push({
        kind: 'on_this_day',
        title: `Il y a ${pluralize(years, 'an', 'ans')} : ${pluralize(n, 'souvenir', 'souvenirs')}`,
        date,
        count: years,
      });
    }
  }
  return moments;
}

/** Prochaines dates à venir (anniversaire et dates spéciales) dans les `days` jours, pour l'affichage. */
export function upcomingMoments(birthDate: string | null, specialDates: SpecialDate[], today: string, days = 30) {
  const next = (date: string) => {
    let year = Number(today.slice(0, 4));
    let candidate = `${year}${date.slice(4)}`;
    if (date.slice(5) === '02-29') candidate = `${year}-02-28`;
    if (candidate < today) {
      year += 1;
      candidate = date.slice(5) === '02-29' ? `${year}-02-28` : `${year}${date.slice(4)}`;
    }
    return candidate;
  };
  const items: { title: string; on: string; years: number }[] = [];
  if (birthDate) {
    const on = next(birthDate);
    const years = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4));
    if (years > 0) items.push({ title: 'Anniversaire', on, years });
  }
  for (const s of specialDates) {
    const on = next(s.date);
    const years = Number(on.slice(0, 4)) - Number(s.date.slice(0, 4));
    if (years > 0) items.push({ title: s.title, on, years });
  }
  return items.filter((i) => daysBetween(today, i.on) <= days).sort((a, b) => a.on.localeCompare(b.on));
}

// ---------------------------------------------------------------- Export

/** Nom de fichier lisible dans une archive : « 2026/12/2026-12-24_18h30_Premier-Noel.jpg ». */
export function exportPath(memory: Pick<Memory, 'takenDate' | 'takenTime' | 'caption' | 'contentType' | 'name' | 'id'>): string {
  const ext = EXTENSIONS[memory.contentType] ?? memory.name?.split('.').pop()?.toLowerCase() ?? 'bin';
  const time = memory.takenTime ? `_${memory.takenTime.replace(':', 'h')}` : '';
  const caption = memory.caption
    ? `_${memory.caption
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)}`
    : '';
  return `${memory.takenDate.slice(0, 4)}/${memory.takenDate.slice(5, 7)}/${memory.takenDate}${time}${caption.length > 1 ? caption : ''}_${memory.id.slice(0, 6)}.${ext}`;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/**
 * Taille maximale d'une archive d'export : l'archive est assemblée par le navigateur, qui doit garder
 * les fichiers le temps de l'écrire. 500 Mo reste supportable par un téléphone ; au-delà, plusieurs archives.
 */
export const EXPORT_PART_BYTES = 500_000_000;

/** Répartit des fichiers en lots successifs de `maxBytes` au plus (un fichier n'est jamais coupé). */
export function splitIntoParts<T extends { size: number }>(items: T[], maxBytes = EXPORT_PART_BYTES): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length && size + item.size > maxBytes) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.size;
  }
  if (current.length) parts.push(current);
  return parts;
}
