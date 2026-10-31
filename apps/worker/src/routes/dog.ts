import { type Contact, type Dog, contactInputSchema, dogInputSchema, fileUrl } from '@eko/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv } from '../env';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';

type DogRow = typeof schema.dog.$inferSelect;
type ContactRow = typeof schema.contact.$inferSelect;

export function toDog(row: DogRow): Dog {
  return {
    id: row.id,
    name: row.name,
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birthDate,
    neutered: row.neutered,
    coat: row.coat,
    chipNumber: row.chipNumber,
    passportNumber: row.passportNumber,
    address: row.address,
    area: row.area,
    notes: row.notes,
    photoUrl: row.photoFileId ? fileUrl(row.photoFileId) : null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    organization: row.organization,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    primary: row.primary,
  };
}

/** Le chien du propriétaire connecté (un seul pour l'instant), ou undefined s'il n'est pas encore créé. */
export async function findDog(db: Db, ownerId: string): Promise<DogRow | undefined> {
  return db.query.dog.findFirst({ where: eq(schema.dog.ownerId, ownerId), orderBy: asc(schema.dog.createdAt) });
}

/** Comme findDog, mais renvoie une erreur 409 claire si le profil n'existe pas encore. */
export async function requireDog(c: Context<AppEnv>): Promise<DogRow> {
  const dog = await findDog(c.get('db'), c.get('session').ownerId);
  if (!dog) throw apiError(409, 'no_dog', 'Crée d’abord le profil d’Eko.');
  return dog;
}

/** Un seul vétérinaire référent : en désigner un retire ce rôle aux autres. */
async function clearPrimary(db: Db, dogId: string, exceptId: string) {
  const others = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(and(eq(schema.contact.dogId, dogId), eq(schema.contact.primary, true)));
  for (const other of others) {
    if (other.id !== exceptId) {
      await db.update(schema.contact).set({ primary: false }).where(eq(schema.contact.id, other.id));
    }
  }
}

export const dogRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  .get('/dog', async (c) => {
    const row = await findDog(c.get('db'), c.get('session').ownerId);
    return c.json(row ? toDog(row) : null);
  })

  // Création au premier enregistrement, mise à jour ensuite.
  .put('/dog', async (c) => {
    const input = await readJson(c, dogInputSchema);
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const now = Date.now();
    const existing = await findDog(db, ownerId);
    if (existing) {
      await db.update(schema.dog).set({ ...input, updatedAt: now }).where(eq(schema.dog.id, existing.id));
    } else {
      await db.insert(schema.dog).values({ id: randomId(), ownerId, ...input, createdAt: now, updatedAt: now });
    }
    return c.json(toDog((await findDog(db, ownerId))!));
  })

  .get('/contacts', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    if (!dog) return c.json([] as Contact[]);
    const rows = await c
      .get('db')
      .select()
      .from(schema.contact)
      .where(eq(schema.contact.dogId, dog.id))
      .orderBy(asc(schema.contact.kind), asc(schema.contact.name));
    return c.json(rows.map(toContact));
  })

  .post('/contacts', async (c) => {
    const input = await readJson(c, contactInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const now = Date.now();
    const id = randomId();
    const primary = input.kind === 'veterinaire' && input.primary;
    await db.insert(schema.contact).values({ id, dogId: dog.id, ...input, primary, createdAt: now, updatedAt: now });
    if (primary) await clearPrimary(db, dog.id, id);
    const row = await db.query.contact.findFirst({ where: eq(schema.contact.id, id) });
    return c.json(toContact(row!), 201);
  })

  .put('/contacts/:id', async (c) => {
    const input = await readJson(c, contactInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const where = and(eq(schema.contact.id, c.req.param('id')), eq(schema.contact.dogId, dog.id));
    const existing = await db.query.contact.findFirst({ where });
    if (!existing) throw apiError(404, 'not_found', 'Contact introuvable.');
    const primary = input.kind === 'veterinaire' && input.primary;
    await db.update(schema.contact).set({ ...input, primary, updatedAt: Date.now() }).where(where);
    if (primary) await clearPrimary(db, dog.id, existing.id);
    return c.json(toContact((await db.query.contact.findFirst({ where }))!));
  })

  .delete('/contacts/:id', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const deleted = await db
      .delete(schema.contact)
      .where(and(eq(schema.contact.id, c.req.param('id')), eq(schema.contact.dogId, dog.id)))
      .returning({ id: schema.contact.id });
    if (deleted.length === 0) throw apiError(404, 'not_found', 'Contact introuvable.');
    return c.json({ ok: true });
  });
