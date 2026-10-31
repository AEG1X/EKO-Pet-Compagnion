import { z } from 'zod';
import { isoDateSchema } from './dog';
import { optionalId, optionalText } from './fields';
import type { HealthEvent } from './health';

// ---------------------------------------------------------------- Dates calendaires

/**
 * Calculs sur des dates AAAA-MM-JJ, sans fuseau : faits en UTC pour que le front et le Worker
 * donnent toujours le même résultat, quel que soit l'appareil.
 */
function toUtc(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return fromUtc(toUtc(value) + days * 86_400_000);
}

/** Ajoute des mois en restant sur le dernier jour si le mois cible est plus court (31 janv. + 1 mois = 28 févr.). */
export function addMonths(value: string, months: number, anchorDay = Number(value.slice(8, 10))): string {
  const [y, m] = value.split('-').map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay));
  return fromUtc(target.getTime());
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

// ---------------------------------------------------------------- Rappels

export const REMINDER_KINDS = ['rendez_vous', 'sante', 'toilettage', 'education', 'administratif', 'autre'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  rendez_vous: 'Rendez-vous',
  sante: 'Santé',
  toilettage: 'Toilettage',
  education: 'Éducation',
  administratif: 'Administratif',
  autre: 'Autre',
};

export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Une seule fois',
  daily: 'Chaque jour',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
};

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide')
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((value) => value || null);

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(120, '120 caractères maximum'),
  kind: z.enum(REMINDER_KINDS),
  /** Date de la prochaine occurrence. */
  date: isoDateSchema,
  /** Heure locale HH:MM, facultative : sans heure, le rappel occupe la journée. */
  time: timeSchema,
  recurrence: z.enum(RECURRENCES),
  /** Prévenir N jours avant (0 = le jour même). */
  notifyDaysBefore: z.number().int().min(0, 'Délai invalide').max(30, '30 jours maximum'),
  healthEventId: optionalId,
  notes: optionalText(1000),
});
export type ReminderInput = z.input<typeof reminderInputSchema>;

export interface Reminder {
  id: string;
  title: string;
  kind: ReminderKind;
  date: string;
  time: string | null;
  recurrence: Recurrence;
  notifyDaysBefore: number;
  healthEventId: string | null;
  notes: string | null;
  /** Rappel ponctuel marqué comme fait (date AAAA-MM-JJ), sinon null. */
  doneDate: string | null;
}

/** Occurrence suivante d'un rappel récurrent ; null pour un rappel ponctuel. */
export function nextOccurrence(date: string, recurrence: Recurrence, anchorDay?: number): string | null {
  switch (recurrence) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1, anchorDay);
    case 'yearly':
      return addMonths(date, 12, anchorDay);
    default:
      return null;
  }
}

/** Dates des occurrences d'un rappel entre `from` et `to` inclus (au plus `limit`). */
export function occurrences(
  reminder: Pick<Reminder, 'date' | 'recurrence' | 'doneDate'>,
  from: string,
  to: string,
  limit = 400,
): string[] {
  if (reminder.recurrence === 'none') {
    return reminder.date >= from && reminder.date <= to ? [reminder.date] : [];
  }
  const anchorDay = Number(reminder.date.slice(8, 10));
  const result: string[] = [];
  let current: string | null = reminder.date;
  // Avance rapide pour les rappels quotidiens ou hebdomadaires anciens.
  if (reminder.recurrence === 'daily' && current < from) current = from;
  if (reminder.recurrence === 'weekly' && current < from) {
    current = addDays(current, Math.floor(daysBetween(current, from) / 7) * 7);
  }
  while (current && current <= to && result.length < limit) {
    if (current >= from) result.push(current);
    current = nextOccurrence(current, reminder.recurrence, anchorDay);
  }
  return result;
}

// ---------------------------------------------------------------- Échéances de santé

/**
 * Échéances à suivre : pour chaque soin (même type, même intitulé), seule la plus récente compte,
 * car un rappel déjà refait n'est plus « à venir ». Les retards de plus de 60 jours sont ignorés.
 */
export function upcomingDue(events: HealthEvent[], today: string): HealthEvent[] {
  const latest = new Map<string, HealthEvent>();
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  for (const e of sorted) {
    const key = `${e.kind}:${e.title.trim().toLowerCase()}`;
    if (!latest.has(key)) latest.set(key, e);
  }
  return [...latest.values()]
    .filter((e) => e.nextDueDate && daysBetween(today, e.nextDueDate) >= -60)
    .sort((a, b) => a.nextDueDate!.localeCompare(b.nextDueDate!));
}

// ---------------------------------------------------------------- Abonnement calendrier

export interface CalendarFeedStatus {
  active: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** Réponse à la création du lien : l'adresse n'est montrée qu'une fois, seul son hachage est conservé. */
export interface CalendarFeedCreated {
  url: string;
}
