import { z } from 'zod';
import { isoDateSchema } from './dog';
import { optionalId, optionalText } from './fields';
import type { MediaType } from './memories';

// ---------------------------------------------------------------- Fichiers (R2)

/**
 * Plafonds applicatifs du stockage R2 (décision D2) : l'offre gratuite couvre 10 Go,
 * au-delà R2 facture sans plafond. EKO prévient à 8 Go et refuse tout envoi qui dépasserait 9 Go.
 * Unités décimales (1 Go = 10⁹ octets) : la marge reste sous 10 Go quelle que soit la convention.
 */
export const STORAGE = {
  WARN_BYTES: 8_000_000_000,
  LIMIT_BYTES: 9_000_000_000,
  /** Taille maximale d'un fichier envoyé. */
  MAX_FILE_BYTES: 20_000_000,
  /** Un fichier envoyé mais jamais rattaché à un document est supprimé après ce délai. */
  PENDING_TTL_HOURS: 24,
} as const;

export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type FileType = (typeof FILE_TYPES)[number];
export const IMAGE_TYPES: readonly FileType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const FILE_TYPES_LABEL = 'PDF, JPEG, PNG ou WebP';

export function isFileType(value: string): value is FileType {
  return (FILE_TYPES as readonly string[]).includes(value);
}

/**
 * Reconnaît le type réel d'un fichier à ses premiers octets : le type annoncé par le navigateur
 * ne suffit pas. Renvoie null pour tout format non accepté.
 */
export function sniffFileType(bytes: Uint8Array): FileType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

export interface StoredFile {
  id: string;
  name: string | null;
  contentType: FileType | MediaType;
  size: number;
}

export interface StorageUsage {
  usedBytes: number;
  warnBytes: number;
  limitBytes: number;
}

const units = ['o', 'Ko', 'Mo', 'Go'];

/** « 245 Ko », « 3,2 Mo » : tailles en unités décimales, comme le plafond R2. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })}\u00a0${units[unit]}`;
}

// ---------------------------------------------------------------- Documents

export const DOCUMENT_CATEGORIES = [
  'ordonnance',
  'analyse',
  'compte_rendu',
  'facture',
  'assurance',
  'identification',
  'certificat',
  'autre',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  ordonnance: 'Ordonnance',
  analyse: 'Résultat d’analyse',
  compte_rendu: 'Compte rendu',
  facture: 'Facture',
  assurance: 'Assurance',
  identification: 'Identification',
  certificat: 'Certificat',
  autre: 'Autre',
};

export const documentInputSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(120, '120 caractères maximum'),
  category: z.enum(DOCUMENT_CATEGORIES),
  date: isoDateSchema,
  /** Soin associé (consultation, vaccin…), facultatif. */
  healthEventId: optionalId,
  notes: optionalText(1000),
});
export type DocumentInput = z.input<typeof documentInputSchema>;

/** Création : le fichier, déjà envoyé, est rattaché au document. Il ne change plus ensuite. */
export const documentCreateSchema = documentInputSchema.extend({
  fileId: z.string().min(1, 'Ajoute un fichier').max(64),
});
export type DocumentCreateInput = z.input<typeof documentCreateSchema>;

export interface EkoDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  date: string;
  healthEventId: string | null;
  notes: string | null;
  file: StoredFile;
}

/** Photo du profil : identifiant d'un fichier image envoyé, ou null pour la retirer. */
export const dogPhotoSchema = z.object({
  fileId: z.string().min(1).max(64).nullable(),
});
export type DogPhotoInput = z.input<typeof dogPhotoSchema>;

/** Adresse de lecture d'un fichier stocké, servie par le Worker après contrôle de la session. */
export function fileUrl(id: string, download = false): string {
  return `/api/files/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;
}
