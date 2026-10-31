import { z } from 'zod';
import { type Contact, type Dog, SEX_LABELS, formatAge, phoneSchema } from './dog';
import { optionalText } from './fields';

/**
 * Médaille NFC / QR : les deux pointent vers la même adresse publique, /m/<identifiant>.
 * L'identifiant est aléatoire (96 bits) et révocable : le remplacer désactive l'ancienne médaille.
 */
export const MEDAL_PATH = '/m/';
export const MEDAL_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export function medalUrl(origin: string, publicId: string): string {
  return `${origin}${MEDAL_PATH}${publicId}`;
}

/** Ce que la fiche publique affiche : chaque élément est choisi explicitement par le propriétaire. */
export const medalSettingsSchema = z.object({
  showPhoto: z.boolean(),
  showAge: z.boolean(),
  showArea: z.boolean(),
  showVet: z.boolean(),
  /** Numéro affiché avec un bouton d'appel ; masquable à tout moment. */
  showPhone: z.boolean(),
  phone: phoneSchema.or(z.literal('')).nullable().optional().transform((value) => value || null),
  /** Prénom affiché à côté du numéro (« Appeler Johan »). */
  ownerName: optionalText(40),
  /** Informations médicales d'urgence choisies (allergies, traitement vital…). */
  emergencyInfo: optionalText(500),
  /** Message libre pour la personne qui trouve le chien. */
  message: optionalText(300),
});
export type MedalSettingsInput = z.input<typeof medalSettingsSchema>;
export type MedalSettings = z.output<typeof medalSettingsSchema>;

export const DEFAULT_MEDAL_SETTINGS: MedalSettings = {
  showPhoto: true,
  showAge: true,
  showArea: true,
  showVet: true,
  showPhone: false,
  phone: null,
  ownerName: null,
  emergencyInfo: null,
  message: null,
};

export interface MedalStatus {
  /** Adresse publique encodée dans le QR et la puce NFC ; null tant qu'aucune médaille n'est active. */
  url: string | null;
  createdAt: string | null;
  lastScanAt: string | null;
  scanCount: number;
  settings: MedalSettings;
}

/** Contenu de la fiche publique : uniquement des informations publiables. */
export interface PublicMedal {
  name: string;
  breed: string | null;
  sex: string | null;
  age: string | null;
  hasPhoto: boolean;
  area: string | null;
  emergencyInfo: string | null;
  message: string | null;
  owner: { name: string | null; phone: string } | null;
  vet: { name: string; organization: string | null; phone: string | null; address: string | null } | null;
  /** Mode perdu : bandeau d'alerte et formulaire de signalement sur la fiche. */
  lost: { message: string | null } | null;
}

/** Numéro au format tel: (chiffres et + uniquement). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

/**
 * Construit la fiche publique à partir du profil privé. Adresse, puce, passeport et notes
 * ne sont jamais repris, quels que soient les réglages.
 */
export function buildPublicMedal(
  dog: Pick<Dog, 'name' | 'breed' | 'sex' | 'birthDate' | 'area'> & { hasPhoto: boolean },
  settings: MedalSettings,
  vet: Pick<Contact, 'name' | 'organization' | 'phone' | 'address'> | null,
  lost: { message: string | null } | null = null,
  today = new Date(),
): PublicMedal {
  return {
    name: dog.name,
    breed: dog.breed,
    sex: dog.sex ? SEX_LABELS[dog.sex] : null,
    age: settings.showAge && dog.birthDate ? formatAge(dog.birthDate, today) : null,
    hasPhoto: settings.showPhoto && dog.hasPhoto,
    area: settings.showArea ? dog.area : null,
    emergencyInfo: settings.emergencyInfo,
    message: settings.message,
    owner: settings.showPhone && settings.phone ? { name: settings.ownerName, phone: settings.phone } : null,
    vet:
      settings.showVet && vet
        ? { name: vet.name, organization: vet.organization, phone: vet.phone, address: vet.address }
        : null,
    lost,
  };
}
