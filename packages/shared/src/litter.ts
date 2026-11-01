import { z } from 'zod';
import { optionalDate, optionalId, optionalText } from './fields';
import { addDays } from './reminders';

// ---------------------------------------------------------------- Portée (avant la naissance)

/** Durée moyenne de gestation chez la chienne, en jours après la saillie. */
export const GESTATION_DAYS = 63;
/** Échographie de confirmation : vers 25 à 30 jours après la saillie. */
export const ULTRASOUND_DAYS = 28;
/** Âge minimal légal de cession d'un chiot en France : 8 semaines. */
export const MIN_DEPARTURE_DAYS = 56;

export const litterInputSchema = z.object({
  /** Date de la saillie : exacte, ou approximative (« vers décembre ») si matingApprox. */
  matingDate: optionalDate,
  matingApprox: z.boolean().optional().default(false),
  /** Résultat de l'échographie donné par l'éleveur (« 6 chiots »). */
  ultrasoundResult: optionalText(200),
  /** Date d'arrivée à la maison convenue avec l'éleveur. */
  homeDate: optionalDate,
  notes: optionalText(2000),
});
export type LitterInput = z.input<typeof litterInputSchema>;

export interface Litter {
  matingDate: string | null;
  matingApprox: boolean;
  ultrasoundResult: string | null;
  homeDate: string | null;
  notes: string | null;
}

export type MilestoneKind = 'saillie' | 'echographie' | 'naissance' | 'arrivee';

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  saillie: 'Saillie de la mère',
  echographie: 'Échographie de la mère',
  naissance: 'Naissance',
  arrivee: 'Arrivée à la maison',
};

export interface Milestone {
  kind: MilestoneKind;
  date: string;
  /** Date calculée (pas encore confirmée). */
  estimated: boolean;
  /** Estimation à quelques semaines près : afficher le mois plutôt que le jour. */
  approximate: boolean;
}

/**
 * Jalons de la portée, du plus ancien au plus récent. Une date réelle (naissance, arrivée convenue)
 * remplace toujours son estimation ; les estimations partent de la saillie.
 */
export function litterMilestones(litter: Litter | null, birthDate: string | null): Milestone[] {
  const out: Milestone[] = [];
  const mating = litter?.matingDate ?? null;
  const approx = Boolean(litter?.matingApprox);
  if (mating) {
    out.push({ kind: 'saillie', date: mating, estimated: approx, approximate: approx });
    if (!birthDate) {
      out.push({ kind: 'echographie', date: addDays(mating, ULTRASOUND_DAYS), estimated: true, approximate: approx });
    }
  }
  const birth = birthDate
    ? { date: birthDate, estimated: false, approximate: false }
    : mating
      ? { date: addDays(mating, GESTATION_DAYS), estimated: true, approximate: approx }
      : null;
  if (birth) out.push({ kind: 'naissance', ...birth });
  if (litter?.homeDate) {
    out.push({ kind: 'arrivee', date: litter.homeDate, estimated: false, approximate: false });
  } else if (birth) {
    out.push({ kind: 'arrivee', date: addDays(birth.date, MIN_DEPARTURE_DAYS), estimated: true, approximate: birth.approximate });
  }
  return out;
}

/** Date d'arrivée trop tôt : avant les 8 semaines du chiot (date réelle ou estimée). */
export function homeDateTooEarly(litter: Litter | null, birthDate: string | null): boolean {
  if (!litter?.homeDate) return false;
  const birth = litterMilestones({ ...litter, homeDate: null }, birthDate).find((m) => m.kind === 'naissance');
  return Boolean(birth && litter.homeDate < addDays(birth.date, MIN_DEPARTURE_DAYS));
}

// ---------------------------------------------------------------- Parents

export const PARENT_ROLES = ['pere', 'mere'] as const;
export type ParentRole = (typeof PARENT_ROLES)[number];
export const PARENT_ROLE_LABELS: Record<ParentRole, string> = { pere: 'Père', mere: 'Mère' };

/** Adresse web http(s) uniquement : jamais de javascript: ou data: dans un lien affiché. */
const optionalWebUrl = z
  .string()
  .trim()
  .max(500, '500 caractères maximum')
  .refine((value) => {
    // Pas de dépendance au DOM ici (paquet partagé) : une expression suffit pour imposer http(s) et un hôte.
    return value === '' || /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?([/?#][^\s]*)?$/i.test(value);
  }, 'Adresse web invalide (elle doit commencer par https://)')
  .nullable()
  .optional()
  .transform((value) => value || null);

export const parentInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(60, '60 caractères maximum'),
  /** Affixe : nom de l'élevage accolé au nom du chien. */
  affix: optionalText(80),
  breed: optionalText(60),
  birthDate: optionalDate,
  coat: optionalText(60),
  /** Numéro d'inscription au livre des origines (LOF). */
  registration: optionalText(40),
  chipNumber: optionalText(30),
  pedigreeUrl: optionalWebUrl,
  /** Cotation, titres d'exposition, confirmation… */
  titles: optionalText(200),
  notes: optionalText(2000),
});
export type ParentInput = z.input<typeof parentInputSchema>;

export const parentPhotoSchema = z.object({ fileId: z.string().min(1).max(64).nullable() });

/** Tests de santé courants, proposés à la saisie (texte libre accepté). */
export const COMMON_HEALTH_TESTS = [
  'Dysplasie de la hanche (HD)',
  'Dysplasie du coude (ED)',
  'Luxation de la rotule',
  'Examen oculaire (ECVO)',
  'Thyroïde',
  'Test ADN',
  'Confirmation / test de caractère',
] as const;

export const parentTestInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du test est obligatoire').max(80, '80 caractères maximum'),
  result: optionalText(120),
  date: optionalDate,
  lab: optionalText(80),
  /** Résultat (PDF ou photo) déjà rangé dans Documents. */
  documentId: optionalId,
  notes: optionalText(1000),
});
export type ParentTestInput = z.input<typeof parentTestInputSchema>;

export interface ParentHealthTest {
  id: string;
  name: string;
  result: string | null;
  date: string | null;
  lab: string | null;
  notes: string | null;
  document: { id: string; title: string; fileUrl: string } | null;
}

export interface Parent {
  id: string;
  role: ParentRole;
  name: string;
  affix: string | null;
  breed: string | null;
  birthDate: string | null;
  coat: string | null;
  registration: string | null;
  chipNumber: string | null;
  pedigreeUrl: string | null;
  titles: string | null;
  notes: string | null;
  photoUrl: string | null;
  tests: ParentHealthTest[];
}

/** Rôle lu dans une adresse (/parents/:role) ; null s'il est inconnu. */
export function parseParentRole(value: string): ParentRole | null {
  return (PARENT_ROLES as readonly string[]).includes(value) ? (value as ParentRole) : null;
}
