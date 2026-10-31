import { z } from 'zod';

/** Date calendaire au format AAAA-MM-JJ, sans heure ni fuseau. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Date invalide');

/** Texte facultatif : une chaîne vide est enregistrée comme absente. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ().-]{6,20}$/, 'Numéro de téléphone invalide');

export const DOG_SEXES = ['male', 'femelle'] as const;
export const SEX_LABELS: Record<(typeof DOG_SEXES)[number], string> = { male: 'Mâle', femelle: 'Femelle' };

export const dogInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(40, '40 caractères maximum'),
  breed: optionalText(60),
  sex: z.enum(DOG_SEXES).nullable().optional().transform((value) => value ?? null),
  birthDate: isoDateSchema
    .refine((value) => value <= new Date().toISOString().slice(0, 10), 'La date de naissance est dans le futur')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  neutered: z.boolean().nullable().optional().transform((value) => value ?? null),
  coat: optionalText(60),
  /** Données privées : jamais exposées sur la fiche publique. */
  chipNumber: optionalText(30),
  passportNumber: optionalText(30),
  address: optionalText(200),
  /** Secteur de résidence, assez vague pour pouvoir être publié sur la fiche de la médaille. */
  area: optionalText(80),
  notes: optionalText(2000),
});
export type DogInput = z.input<typeof dogInputSchema>;

export interface Dog {
  id: string;
  name: string;
  breed: string | null;
  sex: (typeof DOG_SEXES)[number] | null;
  birthDate: string | null;
  neutered: boolean | null;
  coat: string | null;
  chipNumber: string | null;
  passportNumber: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  updatedAt: string;
}

export const CONTACT_KINDS = ['veterinaire', 'urgences', 'toiletteur', 'pension', 'educateur', 'eleveur', 'autre'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  veterinaire: 'Vétérinaire',
  urgences: 'Urgences vétérinaires',
  toiletteur: 'Toiletteur',
  pension: 'Pension / garde',
  educateur: 'Éducateur',
  eleveur: 'Éleveur',
  autre: 'Autre',
};

export const contactInputSchema = z.object({
  kind: z.enum(CONTACT_KINDS),
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(80, '80 caractères maximum'),
  organization: optionalText(80),
  phone: phoneSchema.or(z.literal('')).nullable().optional().transform((value) => value || null),
  email: z.email('Adresse e-mail invalide').or(z.literal('')).nullable().optional().transform((value) => value || null),
  address: optionalText(200),
  notes: optionalText(1000),
  /** Vétérinaire référent : un seul à la fois, repris plus tard sur la fiche publique. */
  primary: z.boolean().optional().default(false),
});
export type ContactInput = z.input<typeof contactInputSchema>;

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  primary: boolean;
}

/** Âge lisible (« 2 ans et 3 mois », « 7 semaines ») à partir d'une date AAAA-MM-JJ. */
export function formatAge(birthDate: string, today = new Date()): string {
  const birth = new Date(`${birthDate}T00:00:00`);
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return 'pas encore né';
  if (months < 3) {
    const weeks = Math.floor((today.getTime() - birth.getTime()) / (7 * 24 * 3600 * 1000));
    return weeks <= 1 ? `${Math.max(weeks, 0)} semaine` : `${weeks} semaines`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 0 ? '' : years === 1 ? '1 an' : `${years} ans`;
  const m = rest === 0 ? '' : `${rest} mois`;
  return [y, m].filter(Boolean).join(' et ');
}
