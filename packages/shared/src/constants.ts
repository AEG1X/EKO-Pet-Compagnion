/** Règles de sécurité partagées entre le front et le Worker (cf. dossier de conception, D3 et D5). */
export const SECURITY = {
  SESSION_TTL_DAYS: 30,
  /** Délai d'inactivité après lequel le PIN est redemandé. */
  IDLE_LOCK_MINUTES: 5,
  PIN_LENGTH: 6,
  /** Nombre d'erreurs avant blocage temporaire du PIN. */
  PIN_MAX_ATTEMPTS: 5,
  PIN_LOCKOUT_MINUTES: 15,
  /** Au-delà de ce total d'erreurs, la session est révoquée : reconnexion par passkey obligatoire. */
  PIN_REVOKE_AFTER: 10,
  RECOVERY_CODE_COUNT: 10,
  /** Durée de validité d'un défi WebAuthn. */
  CHALLENGE_TTL_SECONDS: 300,
} as const;

export const SESSION_COOKIE = '__Host-eko_session';

/** Sections du tableau de bord, dans l'ordre par défaut. */
export const DASHBOARD_SECTIONS = [
  'sante',
  'alimentation',
  'education',
  'souvenirs',
  'depenses',
  'documents',
] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

/**
 * Couleurs d'accent proposées. Chaque valeur est contrôlée pour un contraste
 * d'au moins 4,5:1 avec le texte clair des boutons (thème clair) ; le thème
 * sombre utilise la variante `dark`.
 */
export const ACCENTS = {
  foret: { label: 'Forêt', light: '#1F3D2B', dark: '#A9C8A2' },
  sauge: { label: 'Sauge', light: '#3F5E3A', dark: '#B9D1B2' },
  lac: { label: 'Lac', light: '#1F4E5F', dark: '#9CC7D6' },
  miel: { label: 'Miel', light: '#7A4B12', dark: '#E2B36A' },
  bruyere: { label: 'Bruyère', light: '#5B3A5E', dark: '#D3B3D6' },
} as const;
export type AccentId = keyof typeof ACCENTS;
export const ACCENT_IDS = Object.keys(ACCENTS) as [AccentId, ...AccentId[]];
