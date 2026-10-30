import { z } from 'zod';
import { ACCENT_IDS, DASHBOARD_SECTIONS, SECURITY } from './constants';

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const sectionOrderSchema = z
  .array(z.enum(DASHBOARD_SECTIONS))
  .length(DASHBOARD_SECTIONS.length)
  .refine((list) => new Set(list).size === list.length, 'Sections en double');

export const settingsSchema = z.object({
  theme: themeSchema,
  accent: z.enum(ACCENT_IDS),
  sectionOrder: sectionOrderSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial();

export const pinSchema = z
  .string()
  .regex(new RegExp(`^\\d{${SECURITY.PIN_LENGTH}}$`), `Le PIN doit comporter ${SECURITY.PIN_LENGTH} chiffres`);

export const setPinSchema = z.object({ pin: pinSchema });
export const unlockSchema = z.object({ pin: pinSchema });

/** Code de secours : 12 caractères base32 Crockford, groupés par 4. */
export const recoveryCodeSchema = z
  .string()
  .transform((value) => normalizeRecoveryCode(value))
  .pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{12}$/, 'Code de secours invalide'));

export function normalizeRecoveryCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

export const setupStartSchema = z.object({
  setupToken: z.string().min(16).max(256),
  displayName: z.string().trim().min(1).max(60),
});

export const recoveryLoginSchema = z.object({ code: recoveryCodeSchema });

export const passkeyLabelSchema = z.object({ label: z.string().trim().min(1).max(60) });

export type SessionKind = 'full' | 'recovery';

export interface MeResponse {
  owner: { displayName: string };
  sessionKind: SessionKind;
  pinEnabled: boolean;
  locked: boolean;
  settings: Settings;
}

export interface PasskeySummary {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiError {
  error: string;
  message: string;
}
