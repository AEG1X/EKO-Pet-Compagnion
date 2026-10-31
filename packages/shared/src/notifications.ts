import { z } from 'zod';

/** Abonnement Web Push envoyé par le navigateur (PushSubscription.toJSON()). */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url('Adresse invalide').max(1000),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/, 'Clé invalide'),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/, 'Clé invalide'),
  }),
  /** Nom de l'appareil, déduit du navigateur. */
  label: z.string().trim().min(1).max(60),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionInputSchema>;

export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

export interface NotificationStatus {
  push: {
    /** Clés VAPID configurées sur le serveur. */
    available: boolean;
    publicKey: string | null;
    devices: PushDevice[];
  };
  telegram: {
    /** Jeton du bot configuré sur le serveur. */
    available: boolean;
    linked: boolean;
  };
  /** Heure d'envoi du récapitulatif quotidien (heure de Paris). */
  dailyHour: number;
}

export interface TelegramLinkStart {
  /** Lien t.me qui ouvre la conversation avec le bot et envoie le code. */
  url: string;
}

export interface NotificationTestResult {
  push: number;
  telegram: boolean;
}

/** Heure locale (Paris) du récapitulatif quotidien des rappels. */
export const DAILY_NOTIFICATION_HOUR = 8;
