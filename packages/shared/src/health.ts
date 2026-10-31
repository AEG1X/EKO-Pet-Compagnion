import { z } from 'zod';
import { isoDateSchema } from './dog';

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));
}

const optionalDate = isoDateSchema
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((value) => value || null);

export const HEALTH_EVENT_KINDS = ['vaccin', 'antiparasitaire', 'consultation', 'symptome', 'soin'] as const;
export type HealthEventKind = (typeof HEALTH_EVENT_KINDS)[number];
export const HEALTH_EVENT_LABELS: Record<HealthEventKind, string> = {
  vaccin: 'Vaccin',
  antiparasitaire: 'Antiparasitaire',
  consultation: 'Consultation',
  symptome: 'Symptôme',
  soin: 'Soin',
};

export const healthEventInputSchema = z
  .object({
    kind: z.enum(HEALTH_EVENT_KINDS),
    date: isoDateSchema,
    title: z.string().trim().min(1, 'Le titre est obligatoire').max(120, '120 caractères maximum'),
    contactId: z.string().max(64).nullable().optional().transform((value) => value || null),
    /** Prochaine échéance (rappel de vaccin, renouvellement d'antiparasitaire…). */
    nextDueDate: optionalDate,
    notes: optionalText(2000),
  })
  .refine((e) => !e.nextDueDate || e.nextDueDate >= e.date, {
    message: 'La prochaine échéance doit suivre la date du soin',
    path: ['nextDueDate'],
  });
export type HealthEventInput = z.input<typeof healthEventInputSchema>;

export interface HealthEvent {
  id: string;
  kind: HealthEventKind;
  date: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  nextDueDate: string | null;
  notes: string | null;
}

export const treatmentInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom est obligatoire').max(120, '120 caractères maximum'),
    dosage: optionalText(120),
    frequency: optionalText(120),
    startDate: isoDateSchema,
    endDate: optionalDate,
    notes: optionalText(2000),
  })
  .refine((t) => !t.endDate || t.endDate >= t.startDate, {
    message: 'La fin du traitement doit suivre son début',
    path: ['endDate'],
  });
export type TreatmentInput = z.input<typeof treatmentInputSchema>;

export interface Treatment {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

/** Poids saisi en kilogrammes (virgule acceptée côté front), stocké en grammes. */
export const weightInputSchema = z.object({
  date: isoDateSchema.refine((value) => value <= new Date().toISOString().slice(0, 10), 'La date est dans le futur'),
  grams: z.number().int('Poids invalide').min(100, 'Poids invalide').max(150_000, 'Poids invalide'),
  notes: optionalText(500),
});
export type WeightInput = z.input<typeof weightInputSchema>;

export interface WeightEntry {
  id: string;
  date: string;
  grams: number;
  notes: string | null;
}

/** « 23,4 kg » à partir de grammes. */
export function formatWeight(grams: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(grams / 1000)} kg`;
}

/** « 23,4 » ou « 23.4 » → 23400 grammes ; null si la saisie n'est pas un nombre. */
export function parseKilograms(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 1000);
}

/** Un traitement est en cours s'il n'a pas de fin ou si sa fin n'est pas passée. */
export function isTreatmentActive(treatment: Pick<Treatment, 'endDate'>, today = new Date().toISOString().slice(0, 10)) {
  return !treatment.endDate || treatment.endDate >= today;
}
