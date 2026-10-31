import type { Album, Memory, ShareLink } from '@eko/shared';
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db/client';
import { sendDailyDigests } from '../src/routes/notifications';
import { ORIGIN, type TestClient, expectPrivateRoute, setupOwner } from './client';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(300).map((_, i) => i % 200)]);

async function ownerWithDog(dog: Record<string, unknown> = {}) {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko', ...dog });
  return ctx;
}

let counter = 0;
async function addMemory(client: TestClient, takenDate = '2026-10-20', caption: string | null = null): Promise<Memory> {
  const bytes = new Uint8Array([...JPEG, counter++]);
  const upload = await SELF.fetch(`${ORIGIN}/api/media`, {
    method: 'PUT',
    headers: { origin: ORIGIN, 'cf-connecting-ip': client.ip, cookie: client.cookie!, 'x-file-name': 'IMG.jpg' },
    body: bytes,
  });
  const file = (await upload.json()) as { id: string };
  const preview = (await (await client.upload(JPEG, 'image/jpeg')).json()) as { id: string };
  const res = await client.post('/api/memories', {
    fileId: file.id,
    previewFileId: preview.id,
    contentHash: counter.toString(16).padStart(64, '0'),
    takenDate,
    dateSource: 'exif',
    caption,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Memory;
}

/** Visiteur anonyme d'un album partagé. */
function visit(path: string, headers: Record<string, string> = {}) {
  return SELF.fetch(`${ORIGIN}${path}`, { headers: { 'cf-connecting-ip': '198.51.100.7', ...headers } });
}

describe('accès aux albums', () => {
  it.each([
    ['GET', '/api/albums', undefined],
    ['POST', '/api/albums', { name: 'Vacances' }],
    ['PATCH', '/api/albums/x', { name: 'Vacances' }],
    ['DELETE', '/api/albums/x', undefined],
    ['PUT', '/api/albums/x/memories', { add: [] }],
    ['PUT', '/api/albums/x/cover', { memoryId: null }],
    ['GET', '/api/albums/x/shares', undefined],
    ['POST', '/api/albums/x/shares', { label: 'Famille', days: 7 }],
    ['POST', '/api/shares/x/revoke', undefined],
    ['DELETE', '/api/shares/x', undefined],
    ['GET', '/api/memories/moments', undefined],
    ['PUT', '/api/memories/reminders', { birthday: true, monthly: true, onThisDay: true, specialDates: true }],
    ['POST', '/api/special-dates', { title: 'Arrivée', date: '2026-01-01' }],
    ['DELETE', '/api/special-dates/x', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('albums', () => {
  it('range des souvenirs dans un album sans les dupliquer', async () => {
    const { client } = await ownerWithDog();
    const a = await addMemory(client, '2026-10-01');
    const b = await addMemory(client, '2026-10-15');
    const album = (await (await client.post('/api/albums', { name: 'Premiers jours', description: 'Bienvenue' })).json()) as Album;
    expect(album).toMatchObject({ name: 'Premiers jours', count: 0, coverUrl: null });

    let updated = (await (await client.put(`/api/albums/${album.id}/memories`, { add: [a.id, b.id, a.id] })).json()) as Album;
    expect(updated).toMatchObject({ count: 2, firstDate: '2026-10-01', lastDate: '2026-10-15', coverUrl: b.previewUrl });
    updated = (await (await client.put(`/api/albums/${album.id}/cover`, { memoryId: a.id })).json()) as Album;
    expect(updated.coverUrl).toBe(a.previewUrl);

    const memories = (await (await client.get('/api/memories')).json()) as Memory[];
    expect(memories.find((m) => m.id === a.id)!.albumIds).toEqual([album.id]);

    // Supprimer un souvenir le retire de l'album et de la couverture.
    await client.delete(`/api/memories/${a.id}`);
    const [after] = (await (await client.get('/api/albums')).json()) as Album[];
    expect(after).toMatchObject({ count: 1, coverMemoryId: null, coverUrl: b.previewUrl });

    // Supprimer l'album garde les souvenirs.
    expect((await client.delete(`/api/albums/${album.id}`)).status).toBe(200);
    expect((await (await client.get('/api/memories')).json()) as Memory[]).toHaveLength(1);
  });

  it('refuse un souvenir inconnu ou un album inconnu', async () => {
    const { client } = await ownerWithDog();
    const album = (await (await client.post('/api/albums', { name: 'A' })).json()) as Album;
    expect((await client.put(`/api/albums/${album.id}/memories`, { add: ['inconnu'] })).status).toBe(400);
    expect((await client.get('/api/albums/inconnu/shares')).status).toBe(404);
    expect((await client.put(`/api/albums/${album.id}/cover`, { memoryId: 'inconnu' })).status).toBe(400);
  });
});

describe('partage d’un album', () => {
  async function sharedAlbum(share: Record<string, unknown> = { label: 'Famille', days: 7 }) {
    const ctx = await ownerWithDog();
    const memory = await addMemory(ctx.client, '2026-10-20', 'Première balade <3');
    const album = (await (await ctx.client.post('/api/albums', { name: 'Balades' })).json()) as Album;
    await ctx.client.put(`/api/albums/${album.id}/memories`, { add: [memory.id] });
    const res = await ctx.client.post(`/api/albums/${album.id}/shares`, share);
    expect(res.status).toBe(201);
    const link = (await res.json()) as ShareLink;
    return { ...ctx, memory, album, link, path: new URL(link.url).pathname };
  }

  it('montre l’album en lecture seule, sans session et sans indexation', async () => {
    const { client, memory, link, path, album } = await sharedAlbum();
    expect(link).toMatchObject({ status: 'active', allowDownload: false, viewCount: 0 });
    expect(path).toMatch(/^\/partage\/[A-Za-z0-9_-]{22}$/);

    const page = await visit(path);
    expect(page.status).toBe(200);
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    expect(page.headers.get('cache-control')).toBe('no-store');
    const html = await page.text();
    expect(html).toContain('Balades');
    expect(html).toContain('Les souvenirs de Eko');
    expect(html).not.toContain('<script');

    const item = await (await visit(`${path}/${memory.id}`)).text();
    expect(item).toContain('Première balade &lt;3');
    expect(item).not.toContain('Télécharger');

    const original = await visit(`${path}/fichier/${memory.id}?telecharger=1`);
    expect(original.status).toBe(200);
    expect(original.headers.get('content-disposition')).toMatch(/^inline/);
    expect((await visit(`${path}/apercu/${memory.id}`)).status).toBe(200);

    // Un souvenir hors de l'album n'est pas accessible par ce lien.
    const outside = await addMemory(client, '2026-10-21');
    expect((await visit(`${path}/fichier/${outside.id}`)).status).toBe(404);
    expect((await visit(`${path}/${outside.id}`)).status).toBe(404);

    const [stats] = (await (await client.get(`/api/albums/${album.id}/shares`)).json()) as ShareLink[];
    expect(stats!.viewCount).toBe(1);
  });

  it('permet le téléchargement seulement si le lien l’autorise', async () => {
    const { memory, path } = await sharedAlbum({ label: 'Moi', days: null, allowDownload: true });
    expect(await (await visit(`${path}/${memory.id}`)).text()).toContain('Télécharger l’original');
    const res = await visit(`${path}/fichier/${memory.id}?telecharger=1`);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('coupe l’accès dès la révocation', async () => {
    const { client, memory, link, path } = await sharedAlbum();
    expect((await client.delete(`/api/shares/${link.id}`)).status).toBe(409);
    expect((await client.post(`/api/shares/${link.id}/revoke`)).status).toBe(200);
    for (const p of [path, `${path}/${memory.id}`]) {
      const res = await visit(p);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('Ce lien n’est plus disponible');
    }
    expect((await visit(`${path}/apercu/${memory.id}`)).status).toBe(404);
    expect((await visit(`${path}/fichier/${memory.id}`)).status).toBe(404);
    expect((await client.delete(`/api/shares/${link.id}`)).status).toBe(200);
  });

  it('refuse un lien expiré ou inventé', async () => {
    const { path } = await sharedAlbum({ label: 'Famille', days: 1 });
    await env.DB.prepare('UPDATE share_link SET expires_at = ?').bind(Date.now() - 1000).run();
    expect((await visit(path)).status).toBe(404);
    expect((await visit('/partage/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await visit('/partage/court')).status).toBe(404);
  });

  it('limite le nombre de pages consultées par visiteur', async () => {
    const { path } = await sharedAlbum();
    expect((await visit(path)).status).toBe(200);
    await env.DB.prepare("UPDATE rate_limit SET count = 300 WHERE key LIKE 'share:%'").run();
    expect((await visit(path)).status).toBe(429);
  });

  it('supprime les liens avec l’album', async () => {
    const { client, album, path } = await sharedAlbum();
    await client.delete(`/api/albums/${album.id}`);
    expect((await visit(path)).status).toBe(404);
    expect((await env.DB.prepare('SELECT id FROM share_link').all()).results).toHaveLength(0);
  });
});

describe('rappels souvenirs', () => {
  it('liste les moments, les dates spéciales et les réglages', async () => {
    const { client } = await ownerWithDog({ birthDate: '2025-11-15' });
    const created = await client.post('/api/special-dates', { title: 'Arrivée à la maison', date: '2026-01-10' });
    expect(created.status).toBe(201);
    const moments = (await (await client.get('/api/memories/moments')).json()) as {
      settings: Record<string, boolean>;
      specialDates: { id: string; title: string }[];
      upcoming: { title: string; on: string; years: number }[];
    };
    expect(moments.settings).toEqual({ birthday: true, monthly: true, onThisDay: true, specialDates: true });
    expect(moments.specialDates.map((s) => s.title)).toEqual(['Arrivée à la maison']);
    expect(moments.upcoming).toContainEqual({ title: 'Anniversaire', on: '2026-11-15', years: 1 });

    expect((await client.put('/api/memories/reminders', { birthday: false, monthly: true, onThisDay: false, specialDates: true })).status).toBe(200);
    const again = (await (await client.get('/api/memories/moments')).json()) as { settings: Record<string, boolean> };
    expect(again.settings.birthday).toBe(false);
    expect((await client.delete(`/api/special-dates/${moments.specialDates[0]!.id}`)).status).toBe(200);
  });

  it('ajoute l’anniversaire et « ce jour-là » au récapitulatif de 8 h', async () => {
    const { client } = await ownerWithDog({ birthDate: '2025-11-01' });
    await addMemory(client, '2025-11-01');
    const owner = await getDb(env.DB).query.owner.findFirst();
    await env.DB.prepare("INSERT INTO telegram_link (owner_id, chat_id, linked_at) VALUES (?, '4242', 0)").bind(owner!.id).run();
    const bodies: string[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return Response.json({ ok: true, result: {} });
    }) as unknown as typeof fetch;
    await sendDailyDigests({ ...env, TELEGRAM_BOT_TOKEN: '123:abc' }, getDb(env.DB), new Date('2026-11-01T07:00:00Z'), fetcher);
    expect(bodies).toHaveLength(1);
    const text = JSON.parse(bodies[0]!).text as string;
    expect(text).toContain('Joyeux anniversaire Eko : 1 an aujourd’hui !');
    expect(text).toContain('Il y a 1 an : 1 souvenir');
  });
});
