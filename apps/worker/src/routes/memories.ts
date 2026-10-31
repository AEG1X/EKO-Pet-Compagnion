import {
  MEDIA_MAX_BYTES,
  MEDIA_TYPES,
  MEDIA_TYPES_LABEL,
  type Memory,
  PREVIEW_MAX_BYTES,
  STORAGE,
  fileUrl,
  formatBytes,
  isVideoType,
  memoryCheckSchema,
  memoryCreateSchema,
  memoryUpdateSchema,
  sniffMediaType,
} from '@eko/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv } from '../env';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';
import { requireDog } from './dog';
import { claimFile, cleanFileName, deleteFile, toFile, usedBytes } from './files';

type MemoryRow = typeof schema.memory.$inferSelect;
type FileRow = typeof schema.storedFile.$inferSelect;

/** Octets lus avant de reconnaître le format (signature et marque « ftyp »). */
const SNIFF_BYTES = 16;

function toMemory(row: MemoryRow, file: FileRow, albumIds: string[] = []): Memory {
  return {
    id: row.id,
    kind: row.kind,
    contentType: file.contentType as Memory['contentType'],
    size: file.size,
    name: file.name,
    takenDate: row.takenDate,
    takenTime: row.takenTime,
    dateSource: row.dateSource,
    caption: row.caption,
    favorite: row.favorite,
    width: row.width,
    height: row.height,
    durationSeconds: row.durationSeconds,
    url: fileUrl(file.id),
    previewUrl: row.previewFileId ? fileUrl(row.previewFileId) : null,
    albumIds,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function listMemories(db: Db, dogId: string, id?: string): Promise<Memory[]> {
  const m = schema.memory;
  const rows = await db
    .select({ memory: m, file: schema.storedFile })
    .from(m)
    .innerJoin(schema.storedFile, eq(schema.storedFile.id, m.fileId))
    .where(id ? and(eq(m.dogId, dogId), eq(m.id, id)) : eq(m.dogId, dogId))
    .orderBy(desc(m.takenDate), desc(m.takenTime), desc(m.createdAt));
  const links = await db
    .select({ albumId: schema.albumMemory.albumId, memoryId: schema.albumMemory.memoryId })
    .from(schema.albumMemory)
    .innerJoin(schema.album, eq(schema.album.id, schema.albumMemory.albumId))
    .where(id ? and(eq(schema.album.dogId, dogId), eq(schema.albumMemory.memoryId, id)) : eq(schema.album.dogId, dogId));
  const albums = new Map<string, string[]>();
  for (const l of links) albums.set(l.memoryId, [...(albums.get(l.memoryId) ?? []), l.albumId]);
  return rows.map(({ memory, file }) => toMemory(memory, file, albums.get(memory.id)));
}

/** Lit le début d'un flux sans le consommer : renvoie ces octets et un flux complet équivalent. */
async function peek(body: ReadableStream<Uint8Array>, count: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < count) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
  }
  const head = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    head.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.byteLength) controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head, stream, cancel: () => reader.cancel() };
}

export const memoryRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  /**
   * Envoi brut d'une photo ou d'une vidéo, transmis à R2 au fil de l'eau (jusqu'à 95 Mo) :
   * le Worker ne garde jamais le fichier entier en mémoire. Il reste « en attente » jusqu'à POST /memories.
   */
  .put('/media', async (c) => {
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const declared = Number(c.req.header('content-length'));
    if (!Number.isInteger(declared) || declared <= 0) throw apiError(411, 'length_required', 'Taille du fichier inconnue.');
    if (declared > MEDIA_MAX_BYTES) {
      throw apiError(
        413,
        'file_too_large',
        `Fichier trop lourd : ${formatBytes(MEDIA_MAX_BYTES)} maximum. Pour une longue vidéo, exporte-la en qualité réduite.`,
      );
    }
    const used = await usedBytes(db, ownerId);
    if (used + declared > STORAGE.LIMIT_BYTES) {
      throw apiError(
        507,
        'storage_full',
        `Stockage presque plein (${formatBytes(used)} sur ${formatBytes(STORAGE.LIMIT_BYTES)}). Exporte puis supprime des souvenirs pour en ajouter.`,
      );
    }
    const body = c.req.raw.body;
    if (!body) throw apiError(400, 'invalid_input', 'Le fichier est vide.');

    const { head, stream, cancel } = await peek(body, SNIFF_BYTES);
    const contentType = sniffMediaType(head);
    if (!contentType) {
      await cancel();
      throw apiError(415, 'unsupported_file', `Format non accepté : ${MEDIA_TYPES_LABEL}.`);
    }

    const id = randomId();
    const r2Key = `files/${ownerId}/${id}`;
    // La longueur annoncée est imposée : un corps plus court ou plus long fait échouer l'envoi.
    const fixed = new FixedLengthStream(declared);
    const piping = stream.pipeTo(fixed.writable).catch(() => undefined);
    try {
      await c.env.FILES.put(r2Key, fixed.readable, { httpMetadata: { contentType } });
      await piping;
    } catch {
      await c.env.FILES.delete(r2Key);
      throw apiError(400, 'upload_failed', 'Envoi interrompu ou incomplet. Réessaie.');
    }
    const row: FileRow = {
      id,
      ownerId,
      r2Key,
      contentType,
      size: declared,
      name: cleanFileName(c.req.header('x-file-name')),
      purpose: 'pending',
      createdAt: Date.now(),
    };
    try {
      await db.insert(schema.storedFile).values(row);
    } catch (error) {
      await c.env.FILES.delete(r2Key);
      throw error;
    }
    return c.json(toFile(row), 201);
  })

  // Avant l'envoi : quels fichiers sont déjà dans les souvenirs (même empreinte) ?
  .post('/memories/check', async (c) => {
    const dog = await requireDog(c);
    const { hashes } = await readJson(c, memoryCheckSchema);
    if (hashes.length === 0) return c.json({ existing: [] });
    const rows = await c
      .get('db')
      .select({ hash: schema.memory.contentHash })
      .from(schema.memory)
      .where(and(eq(schema.memory.dogId, dog.id), inArray(schema.memory.contentHash, hashes)));
    return c.json({ existing: rows.map((r) => r.hash) });
  })

  .get('/memories', async (c) => {
    const dog = await requireDog(c);
    return c.json(await listMemories(c.get('db'), dog.id));
  })

  .post('/memories', async (c) => {
    const dog = await requireDog(c);
    const input = await readJson(c, memoryCreateSchema);
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const duplicate = await db
      .select({ id: schema.memory.id })
      .from(schema.memory)
      .where(and(eq(schema.memory.dogId, dog.id), eq(schema.memory.contentHash, input.contentHash)))
      .get();
    if (duplicate) throw apiError(409, 'duplicate', 'Ce souvenir est déjà dans la galerie.');

    const file = await claimFile(db, ownerId, input.fileId, 'memory', MEDIA_TYPES);
    let previewId: string | null = null;
    if (input.previewFileId) {
      const preview = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, input.previewFileId)).get();
      if (preview && preview.size <= PREVIEW_MAX_BYTES) {
        previewId = (await claimFile(db, ownerId, input.previewFileId, 'preview', ['image/jpeg', 'image/webp'])).id;
      }
    }
    const now = Date.now();
    const id = randomId();
    await db.insert(schema.memory).values({
      id,
      dogId: dog.id,
      fileId: file.id,
      previewFileId: previewId,
      contentHash: input.contentHash,
      kind: isVideoType(file.contentType) ? 'video' : 'photo',
      takenDate: input.takenDate,
      takenTime: input.takenTime,
      dateSource: input.dateSource,
      caption: input.caption,
      width: input.width,
      height: input.height,
      durationSeconds: input.durationSeconds,
      createdAt: now,
      updatedAt: now,
    });
    return c.json((await listMemories(db, dog.id, id))[0], 201);
  })

  .patch('/memories/:id', async (c) => {
    const dog = await requireDog(c);
    const input = await readJson(c, memoryUpdateSchema);
    const db = c.get('db');
    const where = and(eq(schema.memory.id, c.req.param('id')), eq(schema.memory.dogId, dog.id));
    const current = await db.select().from(schema.memory).where(where).get();
    if (!current) throw apiError(404, 'not_found', 'Souvenir introuvable.');
    const dateChanged = input.takenDate !== current.takenDate || input.takenTime !== current.takenTime;
    await db
      .update(schema.memory)
      .set({ ...input, dateSource: dateChanged ? 'manual' : current.dateSource, updatedAt: Date.now() })
      .where(where);
    return c.json((await listMemories(db, dog.id, current.id))[0]);
  })

  // Suppression définitive de l'original et de son aperçu (confirmée dans l'interface).
  .delete('/memories/:id', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const row = await db
      .select()
      .from(schema.memory)
      .where(and(eq(schema.memory.id, c.req.param('id')), eq(schema.memory.dogId, dog.id)))
      .get();
    if (!row) throw apiError(404, 'not_found', 'Souvenir introuvable.');
    await db.delete(schema.memory).where(eq(schema.memory.id, row.id));
    for (const fileId of [row.fileId, row.previewFileId]) {
      if (!fileId) continue;
      const file = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, fileId)).get();
      if (file) await deleteFile(c.env, db, file);
    }
    return c.json({ ok: true });
  });
