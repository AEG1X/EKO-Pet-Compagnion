import { type SQL, and, eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { type Context, Hono } from 'hono';
import type { z } from 'zod';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import type { Db } from '../db/client';
import type { AppEnv } from '../env';
import { findDog, requireDog } from '../routes/dog';
import { randomId } from './crypto';
import { apiError } from './errors';
import { readJson } from './validate';

/** Table métier rattachée à un chien, avec horodatages de création et de modification. */
type DogTable = SQLiteTable & {
  id: SQLiteColumn;
  dogId: SQLiteColumn;
  createdAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
};

interface CrudOptions<T extends DogTable, S extends z.ZodType, Dto> {
  table: T;
  input: S;
  toDto: (row: T['$inferSelect']) => Dto;
  orderBy: (table: T) => SQL[];
  /** Message de l'erreur 404, par exemple « Dépense introuvable. ». */
  notFound: string;
  /** Contrôles ou ajustements propres à la ressource, avant l'écriture (ex. : référence à un autre objet du même chien). */
  beforeWrite?: (
    c: Context<AppEnv>,
    dogId: string,
    input: z.output<S>,
    id: string,
  ) => Promise<Record<string, unknown> | void>;
}

/**
 * Routes privées standard d'une ressource du chien : liste, création, modification, suppression.
 * Toujours derrière la session complète déverrouillée ; chaque requête est limitée au chien du propriétaire.
 */
export function dogCrud<T extends DogTable, S extends z.ZodType, Dto>(options: CrudOptions<T, S, Dto>) {
  const { table, input, toDto, orderBy, notFound, beforeWrite } = options;
  // Les tables passées ici ont toutes les colonnes de DogTable : on travaille sur une vue générique.
  const t = table as DogTable;
  const byId = (db: Db, dogId: string, id: string) =>
    db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.dogId, dogId)))
      .get() as Promise<T['$inferSelect'] | undefined>;

  return new Hono<AppEnv>()
    .use('*', loadSession, requireFullSession, requireUnlocked)

    .get('/', async (c) => {
      const db = c.get('db');
      const dog = await findDog(db, c.get('session').ownerId);
      if (!dog) return c.json([] as Dto[]);
      const rows = (await db
        .select()
        .from(t)
        .where(eq(t.dogId, dog.id))
        .orderBy(...orderBy(table))) as T['$inferSelect'][];
      return c.json(rows.map(toDto));
    })

    .post('/', async (c) => {
      const data = await readJson(c, input);
      const dog = await requireDog(c);
      const db = c.get('db');
      const id = randomId();
      const extra = (await beforeWrite?.(c, dog.id, data, id)) ?? {};
      const now = Date.now();
      await db.insert(t).values({ ...(data as object), ...extra, id, dogId: dog.id, createdAt: now, updatedAt: now } as never);
      return c.json(toDto((await byId(db, dog.id, id))!), 201);
    })

    .put('/:id', async (c) => {
      const data = await readJson(c, input);
      const dog = await requireDog(c);
      const db = c.get('db');
      const id = c.req.param('id');
      if (!(await byId(db, dog.id, id))) throw apiError(404, 'not_found', notFound);
      const extra = (await beforeWrite?.(c, dog.id, data, id)) ?? {};
      await db
        .update(t)
        .set({ ...(data as object), ...extra, updatedAt: Date.now() } as never)
        .where(and(eq(t.id, id), eq(t.dogId, dog.id)));
      return c.json(toDto((await byId(db, dog.id, id))!));
    })

    .delete('/:id', async (c) => {
      const dog = await requireDog(c);
      const deleted = await c
        .get('db')
        .delete(t)
        .where(and(eq(t.id, c.req.param('id')), eq(t.dogId, dog.id)))
        .returning({ id: t.id });
      if (deleted.length === 0) throw apiError(404, 'not_found', notFound);
      return c.json({ ok: true });
    });
}

/** Vérifie qu'une référence facultative pointe vers une ligne du même chien. */
export async function checkSameDog(db: Db, table: DogTable, dogId: string, id: string | null, message: string) {
  if (!id) return;
  const found = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.dogId, dogId)))
    .get();
  if (!found) throw apiError(400, 'invalid_input', message);
}
