import type { Db } from './db/client';
import type { SessionContext } from './auth/session';

export interface Env {
  DB: D1Database;
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
}

export interface AppVariables {
  db: Db;
  session: SessionContext;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
