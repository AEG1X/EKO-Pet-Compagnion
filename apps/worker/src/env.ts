import type { Db } from './db/client';
import type { SessionContext } from './auth/session';

export interface Env {
  DB: D1Database;
  /** Bucket R2 privé : documents et photo du profil. */
  FILES: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: 'development' | 'test' | 'staging' | 'production';
  /** Domaine utilisé par WebAuthn (sans protocole ni port). */
  RP_ID: string;
  RP_NAME: string;
  /** Origine exacte de l'application, par exemple https://eko.example. */
  ORIGIN: string;
  /** Secret : autorise la toute première configuration du compte. */
  SETUP_TOKEN?: string;
  /** Secret : clé HMAC protégeant les empreintes du PIN et des adresses IP. */
  PIN_PEPPER: string;
  /** Secrets facultatifs : clés VAPID des notifications Web Push (voir docs/deploiement.md). */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Secret facultatif : jeton du bot Telegram, canal de secours des notifications. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Secret facultatif : jeton du Raspberry Pi pour tirer les sauvegardes (voir docs/sauvegarde.md). */
  BACKUP_TOKEN?: string;
}

export interface AppVariables {
  db: Db;
  session: SessionContext;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
