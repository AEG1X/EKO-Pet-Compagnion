import { DASHBOARD_SECTIONS, type Settings, settingsSchema } from '@eko/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema } from '../db/client';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'foret',
  sectionOrder: [...DASHBOARD_SECTIONS],
  hiddenSections: [],
};

export async function readSettings(db: Db, ownerId: string): Promise<Settings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.ownerId, ownerId) });
  if (!row) return DEFAULT_SETTINGS;
  const parse = (value: string, fallback: unknown) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return fallback;
    }
  };
  const sectionOrder = parse(row.sectionOrder, DEFAULT_SETTINGS.sectionOrder);
  const hiddenSections = parse(row.hiddenSections, []);
  const parsed = settingsSchema.safeParse({ theme: row.theme, accent: row.accent, sectionOrder, hiddenSections });
  // Une valeur invalide (ancienne version, édition manuelle) ne doit jamais casser l'application.
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function writeSettings(db: Db, ownerId: string, value: Settings): Promise<void> {
  const row = {
    theme: value.theme,
    accent: value.accent,
    sectionOrder: JSON.stringify(value.sectionOrder),
    hiddenSections: JSON.stringify(value.hiddenSections),
    updatedAt: Date.now(),
  };
  await db
    .insert(schema.settings)
    .values({ ownerId, ...row })
    .onConflictDoUpdate({ target: schema.settings.ownerId, set: row });
}
