import { type Memory, groupByMonth, sniffMediaType } from '@eko/shared';
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { getDb, schema } from '../src/db/client';
import { ORIGIN, type TestClient, expectPrivateRoute, setupOwner } from './client';

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...ascii('JFIF photo d’Eko'.normalize('NFKD').replace(/[^\x00-\x7f]/g, '')), ...new Uint8Array(200)]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypisom'), 0, 0, 2, 0, ...ascii('isomiso2'), ...new Uint8Array(1000).map((_, i) => i % 251)]);
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypheic'), 0, 0, 0, 0, ...ascii('mif1heic'), ...new Uint8Array(64)]);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  return ctx;
}

function uploadMedia(client: TestClient, bytes: Uint8Array, name?: string) {
  return SELF.fetch(`${ORIGIN}/api/media`, {
    method: 'PUT',
    headers: {
      origin: ORIGIN,
      'cf-connecting-ip': client.ip,
      'content-type': 'application/octet-stream',
      ...(name ? { 'x-file-name': encodeURIComponent(name) } : {}),
      ...(client.cookie ? { cookie: client.cookie } : {}),
    },
    body: bytes,
  });
}

async function addMemory(client: TestClient, bytes = JPEG, hash = HASH_A, extra: Record<string, unknown> = {}) {
  const file = (await (await uploadMedia(client, bytes, 'IMG_0001.jpg')).json()) as { id: string };
  const preview = (await (await client.upload(JPEG, 'image/jpeg')).json()) as { id: string };
  const res = await client.post('/api/memories', {
    fileId: file.id,
    previewFileId: preview.id,
    contentHash: hash,
    takenDate: '2026-12-24',
    takenTime: '18:30',
    dateSource: 'exif',
    width: 4032,
    height: 3024,
    ...extra,
  });
  return res;
}

describe('accès aux souvenirs', () => {
  it.each([
    ['PUT', '/api/media', undefined],
    ['GET', '/api/memories', undefined],
    ['POST', '/api/memories', { fileId: 'x' }],
    ['POST', '/api/memories/check', { hashes: [] }],
    ['PATCH', '/api/memories/x', { takenDate: '2026-01-01', favorite: false }],
    ['DELETE', '/api/memories/x', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('envoi des médias', () => {
  it('reconnaît photos et vidéos à leurs premiers octets', () => {
    expect(sniffMediaType(JPEG)).toBe('image/jpeg');
    expect(sniffMediaType(MP4)).toBe('video/mp4');
    expect(sniffMediaType(HEIC)).toBe('image/heic');
    expect(sniffMediaType(new Uint8Array([0, 0, 0, 0x14, ...ascii('ftypqt  ')]))).toBe('video/quicktime');
    expect(sniffMediaType(ascii('%PDF-1.7 pas une photo'))).toBeNull();
    expect(sniffMediaType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('enregistre une vidéo envoyée au fil de l’eau, octet pour octet', async () => {
    const { client } = await ownerWithDog();
    const res = await uploadMedia(client, MP4, 'Balade.mov');
    expect(res.status).toBe(201);
    const file = (await res.json()) as { id: string; contentType: string; size: number; name: string };
    expect(file).toMatchObject({ contentType: 'video/mp4', size: MP4.byteLength, name: 'Balade.mov' });
    const back = new Uint8Array(await (await client.get(`/api/files/${file.id}`)).arrayBuffer());
    expect(back).toEqual(MP4);
  });

  it('refuse un format inconnu ou un fichier trop lourd', async () => {
    const { client } = await ownerWithDog();
    expect((await uploadMedia(client, ascii('%PDF-1.7 ceci est un document'))).status).toBe(415);
    const big = await SELF.fetch(`${ORIGIN}/api/media`, {
      method: 'PUT',
      headers: { origin: ORIGIN, cookie: client.cookie!, 'content-length': '96000000' },
      body: JPEG,
    });
    expect(big.status).toBe(413);
    expect(await getDb(env.DB).select().from(schema.storedFile)).toHaveLength(0);
  });

  it('sert une partie d’un fichier pour la lecture vidéo', async () => {
    const { client } = await ownerWithDog();
    const file = (await (await uploadMedia(client, MP4)).json()) as { id: string };
    const res = await client.request('GET', `/api/files/${file.id}`, undefined, { range: 'bytes=4-11' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 4-11/${MP4.byteLength}`);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe('ftypisom');
  });
});

describe('souvenirs', () => {
  it('crée, liste, modifie puis supprime un souvenir avec son original', async () => {
    const { client } = await ownerWithDog();
    const res = await addMemory(client);
    expect(res.status).toBe(201);
    const memory = (await res.json()) as Memory;
    expect(memory).toMatchObject({ kind: 'photo', takenDate: '2026-12-24', takenTime: '18:30', dateSource: 'exif', favorite: false });
    expect(memory.previewUrl).not.toBeNull();

    const video = (await (await addMemory(client, MP4, HASH_B, { takenDate: '2027-01-02', durationSeconds: 12 })).json()) as Memory;
    expect(video).toMatchObject({ kind: 'video', contentType: 'video/mp4', durationSeconds: 12 });

    const list = (await (await client.get('/api/memories')).json()) as Memory[];
    expect(list.map((m) => m.takenDate)).toEqual(['2027-01-02', '2026-12-24']);

    const edited = (await (
      await client.patch(`/api/memories/${memory.id}`, { takenDate: '2026-12-25', takenTime: null, caption: 'Premier Noël', favorite: true })
    ).json()) as Memory;
    expect(edited).toMatchObject({ takenDate: '2026-12-25', dateSource: 'manual', caption: 'Premier Noël', favorite: true });

    expect((await client.delete(`/api/memories/${memory.id}`)).status).toBe(200);
    expect((await client.get(memory.url)).status).toBe(404);
    expect((await client.get(memory.previewUrl!)).status).toBe(404);
  });

  it('détecte les doublons avant et après l’envoi', async () => {
    const { client } = await ownerWithDog();
    await addMemory(client);
    const check = (await (await client.post('/api/memories/check', { hashes: [HASH_A, HASH_B] })).json()) as { existing: string[] };
    expect(check.existing).toEqual([HASH_A]);
    expect((await addMemory(client, JPEG, HASH_A)).status).toBe(409);
  });

  it('refuse un fichier déjà utilisé ou un document comme souvenir', async () => {
    const { client } = await ownerWithDog();
    const pdf = (await (await client.upload(ascii('%PDF-1.7\n%%EOF\n'), 'application/pdf')).json()) as { id: string };
    const res = await client.post('/api/memories', { fileId: pdf.id, contentHash: HASH_A, takenDate: '2026-12-24', dateSource: 'file' });
    expect(res.status).toBe(400);
    // Et une vidéo ne peut pas devenir un document.
    const video = (await (await uploadMedia(client, MP4)).json()) as { id: string };
    const doc = await client.post('/api/documents', { title: 'Vidéo', category: 'autre', date: '2026-12-24', fileId: video.id });
    expect(doc.status).toBe(400);
  });
});

describe('classement', () => {
  it('regroupe par mois, du plus récent au plus ancien', () => {
    const groups = groupByMonth([{ takenDate: '2026-11-03' }, { takenDate: '2027-01-10' }, { takenDate: '2026-11-20' }]);
    expect(groups.map((g) => [g.month, g.items.length])).toEqual([
      ['2027-01', 1],
      ['2026-11', 2],
    ]);
    expect(groups[1]!.items[0]!.takenDate).toBe('2026-11-20');
  });
});
