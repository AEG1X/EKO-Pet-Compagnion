import {
  IMAGE_TYPES,
  type Litter,
  type Parent,
  type ParentHealthTest,
  type ParentRole,
  fileUrl,
  litterInputSchema,
  parentInputSchema,
  parentPhotoSchema,
  parentTestInputSchema,
  parseParentRole,
} from '@eko/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv } from '../env';
import { checkSameDog } from '../lib/crud';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';
import { claimFile, deleteFile, ownFile } from './files';
import { findDog, requireDog } from './dog';

/**
 * Avant la naissance : portée d'origine (saillie, échographie, arrivée prévue), parents
 * et leurs tests de santé. Données privées, derrière la session déverrouillée.
 */

type LitterRow = typeof schema.litter.$inferSelect;
type ParentRow = typeof schema.dogParent.$inferSelect;

function toLitter(row: LitterRow): Litter {
  return {
    matingDate: row.matingDate,
    matingApprox: row.matingApprox,
    ultrasoundResult: row.ultrasoundResult,
    homeDate: row.homeDate,
    notes: row.notes,
  };
}

export async function findLitter(db: Db, dogId: string): Promise<Litter | null> {
  const row = await db.select().from(schema.litter).where(eq(schema.litter.dogId, dogId)).get();
  return row ? toLitter(row) : null;
}

/** Parents du chien, tests de santé compris (avec le document lié, s'il existe encore). */
export async function listParents(db: Db, dogId: string): Promise<Parent[]> {
  const parents = await db.select().from(schema.dogParent).where(eq(schema.dogParent.dogId, dogId));
  if (parents.length === 0) return [];
  const t = schema.parentHealthTest;
  const tests = await db
    .select({ test: t, docTitle: schema.document.title, docFileId: schema.document.fileId })
    .from(t)
    .leftJoin(schema.document, eq(schema.document.id, t.documentId))
    .where(
      inArray(
        t.parentId,
        parents.map((p) => p.id),
      ),
    )
    .orderBy(asc(t.name), asc(t.createdAt));
  const byParent = new Map<string, ParentHealthTest[]>();
  for (const { test, docTitle, docFileId } of tests) {
    const list = byParent.get(test.parentId) ?? [];
    list.push({
      id: test.id,
      name: test.name,
      result: test.result,
      date: test.date,
      lab: test.lab,
      notes: test.notes,
      document: test.documentId && docFileId ? { id: test.documentId, title: docTitle ?? '', fileUrl: fileUrl(docFileId) } : null,
    });
    byParent.set(test.parentId, list);
  }
  // La mère d'abord : c'est elle que l'on suit pendant la gestation.
  return parents
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'mere' ? -1 : 1))
    .map((p) => ({
      id: p.id,
      role: p.role,
      name: p.name,
      affix: p.affix,
      breed: p.breed,
      birthDate: p.birthDate,
      coat: p.coat,
      registration: p.registration,
      chipNumber: p.chipNumber,
      pedigreeUrl: p.pedigreeUrl,
      titles: p.titles,
      notes: p.notes,
      photoUrl: p.photoFileId ? fileUrl(p.photoFileId) : null,
      tests: byParent.get(p.id) ?? [],
    }));
}

function roleParam(c: Context<AppEnv>): ParentRole {
  const role = parseParentRole(c.req.param('role') ?? '');
  if (!role) throw apiError(404, 'not_found', 'Parent introuvable.');
  return role;
}

async function findParent(db: Db, dogId: string, role: ParentRole): Promise<ParentRow | undefined> {
  return db
    .select()
    .from(schema.dogParent)
    .where(and(eq(schema.dogParent.dogId, dogId), eq(schema.dogParent.role, role)))
    .get();
}

async function requireParent(db: Db, dogId: string, role: ParentRole): Promise<ParentRow> {
  const row = await findParent(db, dogId, role);
  if (!row) throw apiError(404, 'not_found', 'Parent introuvable : enregistre d’abord sa fiche.');
  return row;
}

async function parentDto(db: Db, dogId: string, role: ParentRole): Promise<Parent> {
  return (await listParents(db, dogId)).find((p) => p.role === role)!;
}

/** Test de santé d'un parent de ce chien, ou 404. */
async function requireTest(db: Db, dogId: string, id: string) {
  const row = await db
    .select({ id: schema.parentHealthTest.id, parentId: schema.parentHealthTest.parentId, role: schema.dogParent.role })
    .from(schema.parentHealthTest)
    .innerJoin(schema.dogParent, eq(schema.dogParent.id, schema.parentHealthTest.parentId))
    .where(and(eq(schema.parentHealthTest.id, id), eq(schema.dogParent.dogId, dogId)))
    .get();
  if (!row) throw apiError(404, 'not_found', 'Test introuvable.');
  return row;
}

async function removePhoto(c: Context<AppEnv>, fileId: string | null) {
  if (!fileId) return;
  const db = c.get('db');
  const old = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, fileId)).get();
  if (old) await deleteFile(c.env, db, old);
}

export const parentRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  // ---------- Portée ----------
  .get('/litter', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    return c.json(dog ? await findLitter(c.get('db'), dog.id) : null);
  })

  .put('/litter', async (c) => {
    const input = await readJson(c, litterInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const now = Date.now();
    await db
      .insert(schema.litter)
      .values({ dogId: dog.id, ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: schema.litter.dogId, set: { ...input, updatedAt: now } });
    return c.json(await findLitter(db, dog.id));
  })

  .delete('/litter', async (c) => {
    const dog = await requireDog(c);
    await c.get('db').delete(schema.litter).where(eq(schema.litter.dogId, dog.id));
    return c.json({ ok: true });
  })

  // ---------- Parents ----------
  .get('/parents', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    return c.json(dog ? await listParents(c.get('db'), dog.id) : ([] as Parent[]));
  })

  // Création au premier enregistrement, mise à jour ensuite.
  .put('/parents/:role', async (c) => {
    const role = roleParam(c);
    const input = await readJson(c, parentInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const now = Date.now();
    await db
      .insert(schema.dogParent)
      .values({ id: randomId(), dogId: dog.id, role, ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [schema.dogParent.dogId, schema.dogParent.role], set: { ...input, updatedAt: now } });
    return c.json(await parentDto(db, dog.id, role));
  })

  // Les tests partent avec la fiche ; les documents liés restent dans Documents.
  .delete('/parents/:role', async (c) => {
    const role = roleParam(c);
    const dog = await requireDog(c);
    const db = c.get('db');
    const row = await requireParent(db, dog.id, role);
    await db.delete(schema.dogParent).where(eq(schema.dogParent.id, row.id));
    await removePhoto(c, row.photoFileId);
    return c.json({ ok: true });
  })

  .put('/parents/:role/photo', async (c) => {
    const role = roleParam(c);
    const { fileId } = await readJson(c, parentPhotoSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const row = await requireParent(db, dog.id, role);
    if (fileId) {
      const pending = await ownFile(db, ownerId, fileId);
      if (!(IMAGE_TYPES as readonly string[]).includes(pending.contentType)) {
        throw apiError(415, 'unsupported_file', 'La photo doit être une image JPEG, PNG ou WebP.');
      }
      await claimFile(db, ownerId, fileId, 'photo', IMAGE_TYPES);
    }
    await db.update(schema.dogParent).set({ photoFileId: fileId, updatedAt: Date.now() }).where(eq(schema.dogParent.id, row.id));
    if (row.photoFileId !== fileId) await removePhoto(c, row.photoFileId);
    return c.json(await parentDto(db, dog.id, role));
  })

  // ---------- Tests de santé ----------
  .post('/parents/:role/tests', async (c) => {
    const role = roleParam(c);
    const input = await readJson(c, parentTestInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const parent = await requireParent(db, dog.id, role);
    await checkSameDog(db, schema.document, dog.id, input.documentId, 'Document introuvable.');
    const now = Date.now();
    await db.insert(schema.parentHealthTest).values({ id: randomId(), parentId: parent.id, ...input, createdAt: now, updatedAt: now });
    return c.json(await parentDto(db, dog.id, role), 201);
  })

  .put('/parent-tests/:id', async (c) => {
    const input = await readJson(c, parentTestInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const test = await requireTest(db, dog.id, c.req.param('id'));
    await checkSameDog(db, schema.document, dog.id, input.documentId, 'Document introuvable.');
    await db.update(schema.parentHealthTest).set({ ...input, updatedAt: Date.now() }).where(eq(schema.parentHealthTest.id, test.id));
    return c.json(await parentDto(db, dog.id, test.role));
  })

  .delete('/parent-tests/:id', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const test = await requireTest(db, dog.id, c.req.param('id'));
    await db.delete(schema.parentHealthTest).where(eq(schema.parentHealthTest.id, test.id));
    return c.json({ ok: true });
  });
