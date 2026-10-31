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

const optionalId = z
  .string()
  .max(64)
  .nullable()
  .optional()
  .transform((value) => value || null);

function optionalInt(min: number, max: number, message: string) {
  return z.number().int(message).min(min, message).max(max, message).nullable().optional().transform((v) => v ?? null);
}

// ---------------------------------------------------------------- Alimentation

export const feedingPlanInputSchema = z
  .object({
    food: z.string().trim().min(1, 'L’aliment est obligatoire').max(120, '120 caractères maximum'),
    dailyGrams: optionalInt(1, 5000, 'Ration invalide'),
    mealsPerDay: optionalInt(1, 10, 'Nombre de repas invalide'),
    startDate: isoDateSchema,
    endDate: optionalDate,
    notes: optionalText(2000),
  })
  .refine((p) => !p.endDate || p.endDate >= p.startDate, {
    message: 'La fin doit suivre le début',
    path: ['endDate'],
  });
export type FeedingPlanInput = z.input<typeof feedingPlanInputSchema>;

export interface FeedingPlan {
  id: string;
  food: string;
  dailyGrams: number | null;
  mealsPerDay: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------- Éducation

export const SKILL_STATUSES = ['a_apprendre', 'en_cours', 'acquis'] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];
export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  a_apprendre: 'À apprendre',
  en_cours: 'En cours',
  acquis: 'Acquis',
};

export const skillInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(80, '80 caractères maximum'),
  status: z.enum(SKILL_STATUSES),
  acquiredDate: optionalDate,
  notes: optionalText(1000),
});
export type SkillInput = z.input<typeof skillInputSchema>;

export interface Skill {
  id: string;
  name: string;
  status: SkillStatus;
  acquiredDate: string | null;
  notes: string | null;
}

export const trainingSessionInputSchema = z.object({
  date: isoDateSchema,
  durationMinutes: optionalInt(1, 600, 'Durée invalide'),
  skillId: optionalId,
  notes: optionalText(2000),
});
export type TrainingSessionInput = z.input<typeof trainingSessionInputSchema>;

export interface TrainingSession {
  id: string;
  date: string;
  durationMinutes: number | null;
  skillId: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------- Dépenses

export const EXPENSE_CATEGORIES = [
  'sante',
  'alimentation',
  'toilettage',
  'education',
  'equipement',
  'assurance',
  'garde',
  'autre',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  sante: 'Santé',
  alimentation: 'Alimentation',
  toilettage: 'Toilettage',
  education: 'Éducation',
  equipement: 'Équipement',
  assurance: 'Assurance',
  garde: 'Garde et pension',
  autre: 'Autre',
};

export const expenseInputSchema = z.object({
  date: isoDateSchema,
  /** Montant en centimes, toujours positif. */
  amountCents: z.number().int('Montant invalide').min(1, 'Montant invalide').max(10_000_000, 'Montant invalide'),
  category: z.enum(EXPENSE_CATEGORIES),
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(120, '120 caractères maximum'),
  /** Soin associé (consultation, vaccin…), facultatif. */
  healthEventId: optionalId,
  notes: optionalText(1000),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;

export interface Expense {
  id: string;
  date: string;
  amountCents: number;
  category: ExpenseCategory;
  label: string;
  healthEventId: string | null;
  notes: string | null;
}

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** « 1 234,50 € » à partir de centimes. */
export function formatEuros(cents: number): string {
  return euros.format(cents / 100);
}

/** « 12,5 », « 12.50 » ou « 1 234,5 » → centimes ; null si la saisie n'est pas un montant. */
export function parseEuros(value: string): number | null {
  const normalized = value.trim().replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
