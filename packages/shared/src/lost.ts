import { z } from 'zod';
import { optionalText } from './fields';

/** Signalements et positions effacés 30 jours après la fin du mode perdu (décision du 31/10/2026). */
export const REPORT_RETENTION_DAYS = 30;

export const lostModeInputSchema = z.object({
  /** Message d'alerte affiché en tête de la fiche publique. */
  message: optionalText(300),
});
export type LostModeInput = z.input<typeof lostModeInputSchema>;

const coordinate = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).nullable().optional().transform((v) => v ?? null);

/**
 * Signalement envoyé par la personne qui a trouvé le chien, depuis la fiche publique.
 * La position n'est jointe qu'après son accord explicite ; sans elle, le signalement reste possible.
 */
export const finderReportSchema = z
  .object({
    message: optionalText(500),
    /** Moyen de recontacter la personne, facultatif. */
    contact: optionalText(100),
    latitude: coordinate(-90, 90),
    longitude: coordinate(-180, 180),
    accuracy: coordinate(0, 100_000),
  })
  .refine((r) => r.message || (r.latitude !== null && r.longitude !== null), {
    message: 'Écris un message ou partage ta position.',
  })
  .refine((r) => (r.latitude === null) === (r.longitude === null), { message: 'Position incomplète.' });
export type FinderReportInput = z.input<typeof finderReportSchema>;

export interface FinderReport {
  id: string;
  createdAt: string;
  message: string | null;
  contact: string | null;
  position: { latitude: number; longitude: number; accuracy: number | null } | null;
}

export interface LostEpisode {
  id: string;
  startedAt: string;
  endedAt: string | null;
  message: string | null;
  reportCount: number;
  /** Date à laquelle les signalements détaillés seront (ou ont été) effacés. */
  purgeAt: string | null;
  purged: boolean;
}

export interface LostStatus {
  /** Épisode en cours, null si le chien n'est pas déclaré perdu. */
  current: LostEpisode | null;
  /** Signalements de l'épisode en cours, puis des épisodes terminés non encore purgés. */
  reports: (FinderReport & { episodeId: string })[];
  history: LostEpisode[];
}

/** Lien de carte (OpenStreetMap) pour une position signalée. */
export function mapUrl(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}
