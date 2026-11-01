import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { type TestClient, expectPrivateRoute, setupOwner } from './client';

const PDF = new TextEncoder().encode('%PDF-1.7\n%test\n1 0 obj << >> endobj\n%%EOF\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const MOTHER = {
  name: 'Tala',
  affix: 'du Val des Loups',
  breed: 'Eurasier',
  registration: 'LOF 12345/678',
  pedigreeUrl: 'https://www.centrale-canine.fr/lofselect/chien/12345',
};
const TEST = { name: 'Dysplasie de la hanche (HD)', result: 'A', date: '2025-03-12', lab: 'Lecteur officiel' };

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko', breed: 'Eurasier' });
  return ctx;
}

async function uploadId(client: TestClient, bytes: Uint8Array, type: string) {
  const res = await client.upload(bytes, type);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe('accès à la portée et aux parents', () => {
  it.each([
    ['GET', '/api/litter', undefined],
    ['PUT', '/api/litter', { matingDate: '2026-12-10' }],
    ['DELETE', '/api/litter', undefined],
    ['GET', '/api/parents', undefined],
    ['PUT', '/api/parents/mere', MOTHER],
    ['DELETE', '/api/parents/mere', undefined],
    ['PUT', '/api/parents/mere/photo', { fileId: null }],
    ['POST', '/api/parents/mere/tests', TEST],
    ['PUT', '/api/parent-tests/inconnu', TEST],
    ['DELETE', '/api/parent-tests/inconnu', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method, path, body);
  });
});

describe('portée', () => {
  it('se crée, se met à jour et se supprime', async () => {
    const { client } = await ownerWithDog();
    expect(await (await client.get('/api/litter')).json()).toBeNull();

    const saved = await client.put('/api/litter', { matingDate: '2026-12-15', matingApprox: true });
    expect(await saved.json()).toEqual({ matingDate: '2026-12-15', matingApprox: true, ultrasoundResult: null, homeDate: null, notes: null });

    const updated = await client.put('/api/litter', { matingDate: '2026-12-08', ultrasoundResult: '6 chiots', homeDate: '2027-04-10' });
    expect(await updated.json()).toMatchObject({ matingDate: '2026-12-08', matingApprox: false, ultrasoundResult: '6 chiots' });

    expect((await client.delete('/api/litter')).status).toBe(200);
    expect(await (await client.get('/api/litter')).json()).toBeNull();
  });

  it('exige un profil et des dates valides', async () => {
    const { client } = await setupOwner();
    expect((await client.put('/api/litter', { matingDate: '2026-12-10' })).status).toBe(409);
    await client.put('/api/dog', { name: 'Eko' });
    expect((await client.put('/api/litter', { matingDate: '2026-13-40' })).status).toBe(400);
  });

  it('ajoute les jalons au calendrier exporté, estimations signalées', async () => {
    const { client } = await ownerWithDog();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const mating = new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10);
    await client.put('/api/litter', { matingDate: mating });
    const ics = await (await client.get('/api/calendar.ics')).text();
    expect(ics).toContain('Saillie de la mère');
    expect(ics).toContain('Naissance (estimation)');
    expect(ics).toContain('Arrivée à la maison (estimation)');
  });
});

describe('parents', () => {
  it('crée, modifie et supprime la fiche d’un parent', async () => {
    const { client } = await ownerWithDog();
    const created = await client.put('/api/parents/mere', MOTHER);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ ...MOTHER, role: 'mere', coat: null, photoUrl: null, tests: [] });

    await client.put('/api/parents/mere', { ...MOTHER, coat: 'Loup' });
    await client.put('/api/parents/pere', { name: 'Odin' });
    const list = (await (await client.get('/api/parents')).json()) as { role: string; coat: string | null }[];
    expect(list.map((p) => p.role)).toEqual(['mere', 'pere']);
    expect(list[0]!.coat).toBe('Loup');

    expect((await client.delete('/api/parents/pere')).status).toBe(200);
    expect((await client.delete('/api/parents/pere')).status).toBe(404);
    const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM dog_parent').all<{ n: number }>();
    expect(results[0]!.n).toBe(1);
  });

  it('refuse un rôle inconnu et un lien de pedigree dangereux', async () => {
    const { client } = await ownerWithDog();
    expect((await client.put('/api/parents/oncle', MOTHER)).status).toBe(404);
    expect((await client.put('/api/parents/mere', { ...MOTHER, pedigreeUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await client.put('/api/parents/mere', { ...MOTHER, name: '' })).status).toBe(400);
  });

  it('ajoute, modifie et supprime un test de santé lié à un document', async () => {
    const { client } = await ownerWithDog();
    expect((await client.post('/api/parents/mere/tests', TEST)).status).toBe(404);
    await client.put('/api/parents/mere', MOTHER);

    const fileId = await uploadId(client, PDF, 'application/pdf');
    const doc = (await (await client.post('/api/documents', { title: 'Radio hanches Tala', category: 'analyse', date: '2025-03-12', fileId })).json()) as {
      id: string;
    };
    const res = await client.post('/api/parents/mere/tests', { ...TEST, documentId: doc.id });
    expect(res.status).toBe(201);
    const parent = (await res.json()) as { tests: { id: string; document: { title: string; fileUrl: string } | null }[] };
    expect(parent.tests[0]).toMatchObject({ ...TEST, document: { id: doc.id, title: 'Radio hanches Tala', fileUrl: `/api/files/${fileId}` } });

    const testId = parent.tests[0]!.id;
    const edited = await client.put(`/api/parent-tests/${testId}`, { ...TEST, result: 'B', documentId: null });
    expect(((await edited.json()) as typeof parent).tests[0]).toMatchObject({ result: 'B', document: null });

    expect((await client.put(`/api/parent-tests/${testId}`, { ...TEST, documentId: 'inconnu' })).status).toBe(400);
    expect((await client.delete(`/api/parent-tests/${testId}`)).status).toBe(200);
    expect((await client.delete(`/api/parent-tests/${testId}`)).status).toBe(404);
  });

  it('ne touche jamais aux parents d’un autre chien', async () => {
    const { client } = await ownerWithDog();
    await env.DB.prepare("INSERT INTO owner (id, display_name, webauthn_user_id, created_at) VALUES ('o2', 'Autre', 'w2', 0)").run();
    await env.DB.prepare("INSERT INTO dog (id, owner_id, name, created_at, updated_at) VALUES ('autre', 'o2', 'Autre', 0, 0)").run();
    await env.DB.prepare(
      "INSERT INTO dog_parent (id, dog_id, role, name, created_at, updated_at) VALUES ('p2', 'autre', 'mere', 'Étrangère', 0, 0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO parent_health_test (id, parent_id, name, created_at, updated_at) VALUES ('t2', 'p2', 'Yeux', 0, 0)",
    ).run();

    expect(await (await client.get('/api/parents')).json()).toEqual([]);
    expect((await client.post('/api/parents/mere/tests', TEST)).status).toBe(404);
    expect((await client.put('/api/parent-tests/t2', TEST)).status).toBe(404);
    expect((await client.delete('/api/parent-tests/t2')).status).toBe(404);
  });

  it('remplace puis retire la photo, et libère le fichier', async () => {
    const { client } = await ownerWithDog();
    await client.put('/api/parents/mere', MOTHER);
    const first = await uploadId(client, PNG, 'image/png');
    const withPhoto = await client.put('/api/parents/mere/photo', { fileId: first });
    expect(await withPhoto.json()).toMatchObject({ photoUrl: `/api/files/${first}` });

    const second = await uploadId(client, PNG, 'image/png');
    await client.put('/api/parents/mere/photo', { fileId: second });
    expect((await client.get(`/api/files/${first}`)).status).toBe(404);

    const pdf = await uploadId(client, PDF, 'application/pdf');
    expect((await client.put('/api/parents/mere/photo', { fileId: pdf })).status).toBe(415);

    await client.delete('/api/parents/mere');
    expect((await client.get(`/api/files/${second}`)).status).toBe(404);
  });
});
