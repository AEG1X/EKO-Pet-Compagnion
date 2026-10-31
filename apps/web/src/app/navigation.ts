import type { IconName } from '../components/Icon';

export interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
  /** Phase du dossier de conception dans laquelle la section devient fonctionnelle. */
  phase?: string;
  description?: string;
}

/** Entrées de la barre latérale (ordinateur), dans l'ordre de la maquette. */
export const NAV: NavEntry[] = [
  { to: '/', label: 'Tableau de bord', icon: 'home' },
  { to: '/profil', label: 'Profil d’Eko', icon: 'user' },
  { to: '/sante', label: 'Santé', icon: 'heart' },
  { to: '/calendrier', label: 'Calendrier', icon: 'calendar' },
  { to: '/alimentation', label: 'Alimentation', icon: 'bowl' },
  { to: '/education', label: 'Éducation', icon: 'cap' },
  { to: '/souvenirs', label: 'Souvenirs', icon: 'image', phase: 'B', description: 'Photos, vidéos, albums et timeline.' },
  { to: '/documents', label: 'Documents', icon: 'file' },
  { to: '/depenses', label: 'Dépenses', icon: 'wallet' },
  { to: '/medaille', label: 'Médaille NFC / QR', icon: 'tag', phase: 'C', description: 'Fiche publique, mode perdu et signalements.' },
  { to: '/reglages', label: 'Réglages', icon: 'settings' },
];

/** Barre inférieure (mobile) : quatre destinations autour du bouton d'ajout. */
export const MOBILE_NAV = {
  left: [
    { to: '/', label: 'Accueil', icon: 'home' },
    { to: '/calendrier', label: 'Calendrier', icon: 'calendar' },
  ],
  right: [
    { to: '/souvenirs', label: 'Souvenirs', icon: 'image' },
    { to: '/plus', label: 'Plus', icon: 'menu' },
  ],
} satisfies Record<string, NavEntry[]>;
