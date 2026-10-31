import { STORAGE } from '@eko/shared';
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { getDb, schema } from '../src/db/client';
import { purgePendingFiles } from '../src/routes/files';
import { ORIGIN, TestClient, expectPrivateRoute, setupOwner } from './client';

const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n1 0 obj << >> endobj\n%%EOF\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const DOC = { title: 'Ordonnance otite', category: 'ordonnance', date: '2026-10-20' };

interface Uploaded {
  id: string;
  size: number;
  contentType: string;
  name: string | null;
}

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  return ctx;
}

async function upload(client: TestClient, bytes = PDF, name?: string) {
  const res = await client.upload(bytes, 'application/pdf', name);
  expect(res.status).toBe(201);
  return (await res.json()) as Uploaded;
}

describe('accès aux fichiers et documents', () => {
  it.each([
    ['GET', '/api/storage', undefined],
    ['PUT', '/api/files', undefined],
    ['GET', '/api/files/x', undefined],
    ['DELETE', '/api/files/x', undefined],
    ['PUT', '/api/dog/photo', { fileId: null }],
    ['GET', '/api/documents', undefined],
    ['POST', '/api/documents', { ...DOC, fileId: 'x' }],
    ['PUT', '/api/documents/x', DOC],
    ['DELETE', '/api/documents/x', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });

  it('refuse un envoi de fichier venant d’une autre origine', async () => {
    const { client } = await ownerWithDog();
    const res = await client.request('PUT', '/api/files', undefined, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('n’accepte un corps non JSON que pour l’envoi de fichier', async () => {
    const { client } = await ownerWithDog();
    const res = await postRaw(client, '/api/documents', PDF);
    expect(res.status).toBe(415);
  });
});

/** Envoi d'un corps brut vers une autre route que PUT /api/files. */
function postRaw(client: TestClient, path: string, body: Uint8Array) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/pdf', cookie: client.cookie ?? '' },
    body,
  });
}

describe('envoi de fichiers', () => {
  it('stocke un PDF dans R2 et le relit avec le nom d’origine', async () => {
    const { client } = await ownerWithDog();
    const file = await upload(client, PDF, 'Ordonnance été.pdf');
    expect(file).toMatchObject({ contentType: 'application/pdf', size: PDF.byteLength, name: 'Ordonnance été.pdf' });

    const res = await client.get(`/api/files/${file.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Ordonnance%20%C3%A9t%C3%A9.pdf");
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);

    const download = await client.get(`/api/files/${file.id}?download=1`);
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('reconnaît le type réel et refuse les autres formats', async () => {
    const { client } = await ownerWithDog();
    // Annoncé comme PDF mais c'est un PNG : le type réel l'emporte.
    expect(await upload(client, PNG)).toMatchObject({ contentType: 'image/png' });
    const html = await client.upload(new TextEncoder().encode('<html><script>alert(1)</script>'), 'application/pdf');
    expect(html.status).toBe(415);
  });

  it('refuse un fichier trop lourd', async () => {
    const { client } = await ownerWithDog();
    const big = new Uint8Array(STORAGE.MAX_FILE_BYTES + 1);
    big.set(PDF);
    expect((await client.upload(big, 'application/pdf')).status).toBe(413);
  });

  it('bloque un envoi qui dépasserait le plafond de stockage', async () => {
    const { client } = await ownerWithDog();
    const first = await upload(client);
    // On simule 9 Go déjà utilisés.
    await getDb(env.DB)
      .update(schema.storedFile)
      .set({ size: STORAGE.LIMIT_BYTES - 10 });
    const res = await client.upload(PDF, 'application/pdf');
    expect(res.status).toBe(507);
    expect(((await res.json()) as { message: string }).message).toContain('Stockage presque plein');
    const usage = await (await client.get('/api/storage')).json();
    expect(usage).toEqual({
      usedBytes: STORAGE.LIMIT_BYTES - 10,
      warnBytes: STORAGE.WARN_BYTES,
      limitBytes: STORAGE.LIMIT_BYTES,
    });
    expect(first.id).toBeTruthy();
  });

  it('isole les fichiers entre propriétaires', async () => {
    const { client } = await ownerWithDog();
    const file = await upload(client);
    // Un second propriétaire, inséré directement : la configuration n'accepte qu'un compte.
    await env.DB.prepare("INSERT INTO owner (id, display_name, webauthn_user_id, created_at) VALUES ('o2', 'Autre', 'w2', 0)").run();
    await env.DB.prepare("UPDATE stored_file SET owner_id = 'o2' WHERE id = ?").bind(file.id).run();
    expect((await client.get(`/api/files/${file.id}`)).status).toBe(404);
    expect((await client.delete(`/api/files/${file.id}`)).status).toBe(404);
    expect((await client.post('/api/documents', { ...DOC, fileId: file.id })).status).toBe(400);
  });

  it('purge les envois jamais rattachés', async () => {
    const { client } = await ownerWithDog();
    const stale = await upload(client);
    const kept = await upload(client);
    await client.post('/api/documents', { ...DOC, fileId: kept.id });
    const db = getDb(env.DB);
    await purgePendingFiles(env, db, Date.now() + (STORAGE.PENDING_TTL_HOURS + 1) * 3_600_000);
    expect((await client.get(`/api/files/${stale.id}`)).status).toBe(404);
    expect((await client.get(`/api/files/${kept.id}`)).status).toBe(200);
    expect(await env.FILES.list({ prefix: 'files/' }).then((l) => l.objects.length)).toBe(1);
  });
});

describe('documents', () => {
  it('crée, modifie et supprime un document avec son fichier', async () => {
    const { client } = await ownerWithDog();
    const file = await upload(client, PDF, 'ordo.pdf');
    const created = await client.post('/api/documents', { ...DOC, fileId: file.id });
    expect(created.status).toBe(201);
    const doc = (await created.json()) as { id: string; file: Uploaded };
    expect(doc).toMatchObject({ ...DOC, file: { id: file.id, name: 'ordo.pdf' } });

    // Un fichier déjà rattaché ne peut ni servir deux fois ni être supprimé seul.
    expect((await client.post('/api/documents', { ...DOC, fileId: file.id })).status).toBe(400);
    expect((await client.delete(`/api/files/${file.id}`)).status).toBe(409);

    const updated = await client.put(`/api/documents/${doc.id}`, { ...DOC, title: 'Ordonnance', category: 'autre' });
    expect(await updated.json()).toMatchObject({ title: 'Ordonnance', category: 'autre' });

    expect((await client.delete(`/api/documents/${doc.id}`)).status).toBe(200);
    expect((await client.get(`/api/files/${file.id}`)).status).toBe(404);
    expect((await env.FILES.list({ prefix: 'files/' })).objects).toHaveLength(0);
    expect(await (await client.get('/api/storage')).json()).toMatchObject({ usedBytes: 0 });
  });

  it('relie un document à un soin du même chien seulement', async () => {
    const { client } = await ownerWithDog();
    const event = (await (
      await client.post('/api/health-events', { kind: 'consultation', date: '2026-10-20', title: 'Otite' })
    ).json()) as { id: string };
    const file = await upload(client);
    const ok = await client.post('/api/documents', { ...DOC, fileId: file.id, healthEventId: event.id });
    expect(await ok.json()).toMatchObject({ healthEventId: event.id });
    const other = await upload(client);
    expect((await client.post('/api/documents', { ...DOC, fileId: other.id, healthEventId: 'inconnu' })).status).toBe(400);
  });

  it('exige le profil du chien', async () => {
    const { client } = await setupOwner();
    const file = await upload(client);
    expect((await client.post('/api/documents', { ...DOC, fileId: file.id })).status).toBe(409);
    expect(await (await client.get('/api/documents')).json()).toEqual([]);
  });
});

describe('photo du profil', () => {
  it('ajoute, remplace puis retire la photo en libérant l’ancienne', async () => {
    const { client } = await ownerWithDog();
    const first = await upload(client, PNG);
    const dog = await (await client.put('/api/dog/photo', { fileId: first.id })).json();
    expect(dog).toMatchObject({ name: 'Eko', photoUrl: `/api/files/${first.id}` });

    const second = await upload(client, PNG);
    await client.put('/api/dog/photo', { fileId: second.id });
    expect((await client.get(`/api/files/${first.id}`)).status).toBe(404);

    const removed = await (await client.put('/api/dog/photo', { fileId: null })).json();
    expect(removed).toMatchObject({ photoUrl: null });
    expect((await env.FILES.list({ prefix: 'files/' })).objects).toHaveLength(0);
  });

  it('refuse un PDF comme photo', async () => {
    const { client } = await ownerWithDog();
    const file = await upload(client, PDF);
    expect((await client.put('/api/dog/photo', { fileId: file.id })).status).toBe(415);
  });
});
