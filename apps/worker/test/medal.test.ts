import { DEFAULT_MEDAL_SETTINGS, type MedalStatus, type PublicMedal, buildPublicMedal } from '@eko/shared';
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { escapeHtml } from '../src/lib/medalPage';
import { ORIGIN, TestClient, expectPrivateRoute, setupOwner } from './client';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const SETTINGS = {
  ...DEFAULT_MEDAL_SETTINGS,
  showPhone: true,
  phone: '06 12 34 56 78',
  ownerName: 'Johan',
  emergencyInfo: 'Allergique au poulet',
  message: 'Je suis gentil mais peureux.',
};

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', {
    name: 'Eko',
    breed: 'Eurasier',
    sex: 'male',
    birthDate: '2026-01-15',
    chipNumber: '250269812345678',
    address: '12 rue des Lilas, 69007 Lyon',
    area: 'Lyon 7e',
    notes: 'Note privée',
  });
  await ctx.client.post('/api/contacts', {
    kind: 'veterinaire',
    name: 'Dr Martin',
    organization: 'Clinique des Berges',
    phone: '04 78 00 00 00',
    primary: true,
  });
  return ctx;
}

async function activate(client: TestClient) {
  const res = await client.post('/api/medal/link');
  expect(res.status).toBe(201);
  const status = (await res.json()) as MedalStatus;
  return { status, path: new URL(status.url!).pathname };
}

const visit = (path: string) => SELF.fetch(`${ORIGIN}${path}`);

describe('accès à la médaille', () => {
  it.each([
    ['GET', '/api/medal', undefined],
    ['PUT', '/api/medal/settings', SETTINGS],
    ['GET', '/api/medal/preview', undefined],
    ['POST', '/api/medal/link', undefined],
    ['DELETE', '/api/medal/link', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('fiche publique', () => {
  it('reste inactive tant que le propriétaire ne l’a pas activée', async () => {
    const { client } = await ownerWithDog();
    const status = (await (await client.get('/api/medal')).json()) as MedalStatus;
    expect(status.url).toBeNull();
    expect(status.settings.showPhone).toBe(false);
  });

  it('affiche les informations choisies, sans aucune donnée privée', async () => {
    const { client } = await ownerWithDog();
    await client.put('/api/medal/settings', SETTINGS);
    const { status, path } = await activate(client);
    expect(path).toMatch(/^\/m\/[A-Za-z0-9_-]{16}$/);
    expect(status.settings.phone).toBe('06 12 34 56 78');

    const res = await visit(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    const html = await res.text();
    expect(html).toContain('Eko');
    expect(html).toContain('Eurasier');
    expect(html).toContain('Lyon 7e');
    expect(html).toContain('href="tel:0612345678"');
    expect(html).toContain('Allergique au poulet');
    expect(html).toContain('Clinique des Berges');
    for (const secret of ['250269812345678', '12 rue des Lilas', 'Note privée']) expect(html).not.toContain(secret);
    expect(html).not.toMatch(/<script|style=/);
  });

  it('masque le numéro dès que le propriétaire le décide', async () => {
    const { client } = await ownerWithDog();
    await client.put('/api/medal/settings', SETTINGS);
    const { path } = await activate(client);
    await client.put('/api/medal/settings', { ...SETTINGS, showPhone: false });
    const html = await (await visit(path)).text();
    expect(html).not.toContain('06 12 34 56 78');
    expect(html).not.toContain('tel:06');
  });

  it('compte les visites', async () => {
    const { client } = await ownerWithDog();
    const { path } = await activate(client);
    await visit(path);
    await visit(path);
    const status = (await (await client.get('/api/medal')).json()) as MedalStatus;
    expect(status.scanCount).toBe(2);
    expect(status.lastScanAt).not.toBeNull();
  });

  it('sert la photo seulement si elle est publiée', async () => {
    const { client } = await ownerWithDog();
    const file = (await (await client.upload(PNG, 'image/png')).json()) as { id: string };
    await client.put('/api/dog/photo', { fileId: file.id });
    const { path } = await activate(client);
    expect(await (await visit(path)).text()).toContain(`src="${path}/photo"`);
    const photo = await visit(`${path}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/png');

    await client.put('/api/medal/settings', { ...DEFAULT_MEDAL_SETTINGS, showPhoto: false });
    expect(await (await visit(path)).text()).not.toContain('/photo');
    expect((await visit(`${path}/photo`)).status).toBe(404);
  });

  it('désactive l’ancienne adresse quand elle est remplacée ou désactivée', async () => {
    const { client } = await ownerWithDog();
    const first = await activate(client);
    const second = await activate(client);
    expect(second.path).not.toBe(first.path);
    expect((await visit(first.path)).status).toBe(404);
    expect(await env.FILES.get(`public/medal/${first.path.slice(3)}.json`)).toBeNull();
    expect((await visit(second.path)).status).toBe(200);

    const off = (await (await client.delete('/api/medal/link')).json()) as MedalStatus;
    expect(off.url).toBeNull();
    const res = await visit(second.path);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('n’est plus active');
    expect(await env.FILES.get(`public/medal/${second.path.slice(3)}.json`)).toBeNull();
  });

  it('répond pareil pour une adresse inconnue ou malformée', async () => {
    expect((await visit('/m/AAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await visit('/m/<script>')).status).toBe(404);
  });

  it('reste consultable si la base de données est indisponible', async () => {
    const { client } = await ownerWithDog();
    await client.put('/api/medal/settings', SETTINGS);
    const { path } = await activate(client);
    const broken = new Proxy(env.DB, {
      get() {
        throw new Error('D1 indisponible');
      },
    });
    const res = await app.request(`${ORIGIN}${path}`, {}, { ...env, DB: broken });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Eko');
    expect(html).toContain('tel:0612345678');
    // Une adresse sans instantané (inconnue ou révoquée) reste introuvable.
    expect((await app.request(`${ORIGIN}/m/AAAAAAAAAAAAAAAA`, {}, { ...env, DB: broken })).status).toBe(404);
  });
});

describe('construction de la fiche', () => {
  const dog = { name: 'Eko', breed: 'Eurasier', sex: 'male' as const, birthDate: '2026-01-15', area: 'Lyon 7e', hasPhoto: true };
  const vet = { name: 'Dr Martin', organization: null, phone: null, address: null };

  it('n’affiche le numéro que s’il est choisi et renseigné', () => {
    expect(buildPublicMedal(dog, { ...DEFAULT_MEDAL_SETTINGS, showPhone: true }, vet).owner).toBeNull();
    const shown: PublicMedal = buildPublicMedal(dog, SETTINGS, vet);
    expect(shown.owner).toEqual({ name: 'Johan', phone: '06 12 34 56 78' });
  });

  it('respecte chaque interrupteur', () => {
    const hidden = buildPublicMedal(
      dog,
      { ...DEFAULT_MEDAL_SETTINGS, showPhoto: false, showAge: false, showArea: false, showVet: false },
      vet,
    );
    expect(hidden).toMatchObject({ hasPhoto: false, age: null, area: null, vet: null, sex: 'Mâle' });
  });

  it('échappe le texte saisi', () => {
    expect(escapeHtml('<b>"Eko" & co\'</b>')).toBe('&lt;b&gt;&quot;Eko&quot; &amp; co&#39;&lt;/b&gt;');
  });
});
