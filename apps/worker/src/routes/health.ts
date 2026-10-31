import {
  type HealthEvent,
  type Treatment,
  type WeightEntry,
  healthEventInputSchema,
  treatmentInputSchema,
  weightInputSchema,
} from '@eko/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv } from '../env';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';
import { findDog, requireDog } from './dog';

type TreatmentRow = typeof schema.treatment.$inferSelect;

function toTreatment(row: TreatmentRow): Treatment {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    frequency: row.frequency,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
  };
}

/** Un soin ne peut citer qu'un contact du même chien. */
async function checkContact(db: Db, dogId: string, contactId: string | null) {
  if (!contactId) return;
  const found = await db.query.contact.findFirst({
    where: and(eq(schema.contact.id, contactId), eq(schema.contact.dogId, dogId)),
    columns: { id: true },
  });
  if (!found) throw apiError(400, 'invalid_input', 'Contact introuvable.');
}

async function listEvents(db: Db, dogId: string, id?: string): Promise<HealthEvent[]> {
  const e = schema.healthEvent;
  const rows = await db
    .select({
      id: e.id,
      kind: e.kind,
      date: e.date,
      title: e.title,
      contactId: e.contactId,
      contactName: schema.contact.name,
      nextDueDate: e.nextDueDate,
      notes: e.notes,
    })
    .from(e)
    .leftJoin(schema.contact, eq(schema.contact.id, e.contactId))
    .where(id ? and(eq(e.dogId, dogId), eq(e.id, id)) : eq(e.dogId, dogId))
    .orderBy(desc(e.date), desc(e.createdAt));
  return rows;
}

export const healthRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  // ---------- Soins : vaccins, antiparasitaires, consultations, symptômes ----------
  .get('/health-events', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    return c.json(dog ? await listEvents(c.get('db'), dog.id) : []);
  })

  .post('/health-events', async (c) => {
    const input = await readJson(c, healthEventInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    await checkContact(db, dog.id, input.contactId);
    const now = Date.now();
    const id = randomId();
    await db.insert(schema.healthEvent).values({ id, dogId: dog.id, ...input, createdAt: now, updatedAt: now });
    return c.json((await listEvents(db, dog.id, id))[0], 201);
  })

  .put('/health-events/:id', async (c) => {
    const input = await readJson(c, healthEventInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    await checkContact(db, dog.id, input.contactId);
    const updated = await db
      .update(schema.healthEvent)
      .set({ ...input, updatedAt: Date.now() })
      .where(and(eq(schema.healthEvent.id, c.req.param('id')), eq(schema.healthEvent.dogId, dog.id)))
      .returning({ id: schema.healthEvent.id });
    if (updated.length === 0) throw apiError(404, 'not_found', 'Soin introuvable.');
    return c.json((await listEvents(db, dog.id, updated[0]!.id))[0]);
  })

  .delete('/health-events/:id', async (c) => {
    const dog = await requireDog(c);
    const deleted = await c
      .get('db')
      .delete(schema.healthEvent)
      .where(and(eq(schema.healthEvent.id, c.req.param('id')), eq(schema.healthEvent.dogId, dog.id)))
      .returning({ id: schema.healthEvent.id });
    if (deleted.length === 0) throw apiError(404, 'not_found', 'Soin introuvable.');
    return c.json({ ok: true });
  })

  // ---------- Traitements ----------
  .get('/treatments', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    if (!dog) return c.json([] as Treatment[]);
    const rows = await c
      .get('db')
      .select()
      .from(schema.treatment)
      .where(eq(schema.treatment.dogId, dog.id))
      .orderBy(desc(schema.treatment.startDate));
    return c.json(rows.map(toTreatment));
  })

  .post('/treatments', async (c) => {
    const input = await readJson(c, treatmentInputSchema);
    const dog = await requireDog(c);
    const now = Date.now();
    const [row] = await c
      .get('db')
      .insert(schema.treatment)
      .values({ id: randomId(), dogId: dog.id, ...input, createdAt: now, updatedAt: now })
      .returning();
    return c.json(toTreatment(row!), 201);
  })

  .put('/treatments/:id', async (c) => {
    const input = await readJson(c, treatmentInputSchema);
    const dog = await requireDog(c);
    const [row] = await c
      .get('db')
      .update(schema.treatment)
      .set({ ...input, updatedAt: Date.now() })
      .where(and(eq(schema.treatment.id, c.req.param('id')), eq(schema.treatment.dogId, dog.id)))
      .returning();
    if (!row) throw apiError(404, 'not_found', 'Traitement introuvable.');
    return c.json(toTreatment(row));
  })

  .delete('/treatments/:id', async (c) => {
    const dog = await requireDog(c);
    const deleted = await c
      .get('db')
      .delete(schema.treatment)
      .where(and(eq(schema.treatment.id, c.req.param('id')), eq(schema.treatment.dogId, dog.id)))
      .returning({ id: schema.treatment.id });
    if (deleted.length === 0) throw apiError(404, 'not_found', 'Traitement introuvable.');
    return c.json({ ok: true });
  })

  // ---------- Poids ----------
  .get('/weights', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    if (!dog) return c.json([] as WeightEntry[]);
    const rows = await c
      .get('db')
      .select({ id: schema.weightEntry.id, date: schema.weightEntry.date, grams: schema.weightEntry.grams, notes: schema.weightEntry.notes })
      .from(schema.weightEntry)
      .where(eq(schema.weightEntry.dogId, dog.id))
      .orderBy(asc(schema.weightEntry.date));
    return c.json(rows satisfies WeightEntry[]);
  })

  // Une pesée par jour : une nouvelle saisie à la même date remplace l'ancienne.
  .post('/weights', async (c) => {
    const input = await readJson(c, weightInputSchema);
    const dog = await requireDog(c);
    const [row] = await c
      .get('db')
      .insert(schema.weightEntry)
      .values({ id: randomId(), dogId: dog.id, ...input, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: [schema.weightEntry.dogId, schema.weightEntry.date],
        set: { grams: input.grams, notes: input.notes },
      })
      .returning({ id: schema.weightEntry.id, date: schema.weightEntry.date, grams: schema.weightEntry.grams, notes: schema.weightEntry.notes });
    return c.json(row satisfies WeightEntry | undefined, 201);
  })

  .delete('/weights/:id', async (c) => {
    const dog = await requireDog(c);
    const deleted = await c
      .get('db')
      .delete(schema.weightEntry)
      .where(and(eq(schema.weightEntry.id, c.req.param('id')), eq(schema.weightEntry.dogId, dog.id)))
      .returning({ id: schema.weightEntry.id });
    if (deleted.length === 0) throw apiError(404, 'not_found', 'Pesée introuvable.');
    return c.json({ ok: true });
  });
