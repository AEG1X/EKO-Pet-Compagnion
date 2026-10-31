import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { expectPrivateRoute, setupOwner } from './client';

const EKO = {
  name: 'Eko',
  breed: 'Eurasier',
  sex: 'male',
  birthDate: '2024-07-15',
  neutered: false,
  chipNumber: '250269812345678',
  area: 'Lyon 7e',
};

const VET = { kind: 'veterinaire', name: 'Dr Martin', organization: 'Clinique des Berges', phone: '04 72 00 00 00' };

describe('accès au profil et aux contacts', () => {
  it.each([
    ['GET', '/api/dog', undefined],
    ['PUT', '/api/dog', EKO],
    ['GET', '/api/contacts', undefined],
    ['POST', '/api/contacts', VET],
    ['PUT', '/api/contacts/inconnu', VET],
    ['DELETE', '/api/contacts/inconnu', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method, path, body);
  });
});

describe('profil d’Eko', () => {
  it('est vide au départ, se crée puis se met à jour', async () => {
    const { client } = await setupOwner();
    expect(await (await client.get('/api/dog')).json()).toBeNull();

    const created = await client.put('/api/dog', EKO);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ ...EKO, coat: null, notes: null });

    const updated = await client.put('/api/dog', { ...EKO, neutered: true, breed: '' });
    expect(await updated.json()).toMatchObject({ neutered: true, breed: null });
    const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM dog').all<{ n: number }>();
    expect(results[0]!.n).toBe(1);
  });

  it('refuse des données invalides', async () => {
    const { client } = await setupOwner();
    expect((await client.put('/api/dog', { name: '' })).status).toBe(400);
    expect((await client.put('/api/dog', { name: 'Eko', sex: 'inconnu' })).status).toBe(400);
    expect((await client.put('/api/dog', { name: 'Eko', birthDate: '2999-01-01' })).status).toBe(400);
  });
});

describe('contacts', () => {
  it('exige un profil existant', async () => {
    const { client } = await setupOwner();
    expect((await client.post('/api/contacts', VET)).status).toBe(409);
    expect(await (await client.get('/api/contacts')).json()).toEqual([]);
  });

  it('ajoute, modifie et supprime un contact', async () => {
    const { client } = await setupOwner();
    await client.put('/api/dog', EKO);
    const created = await client.post('/api/contacts', { ...VET, primary: true });
    expect(created.status).toBe(201);
    const vet = (await created.json()) as { id: string };
    expect(vet).toMatchObject({ ...VET, primary: true, email: null });

    const edited = await client.put(`/api/contacts/${vet.id}`, { ...VET, email: 'accueil@clinique.fr', primary: true });
    expect(await edited.json()).toMatchObject({ email: 'accueil@clinique.fr' });

    expect((await client.delete(`/api/contacts/${vet.id}`)).status).toBe(200);
    expect((await client.delete(`/api/contacts/${vet.id}`)).status).toBe(404);
    expect(await (await client.get('/api/contacts')).json()).toEqual([]);
  });

  it('garde un seul vétérinaire référent, et jamais pour un autre type de contact', async () => {
    const { client } = await setupOwner();
    await client.put('/api/dog', EKO);
    const first = (await (await client.post('/api/contacts', { ...VET, primary: true })).json()) as { id: string };
    await client.post('/api/contacts', { ...VET, name: 'Dr Petit', primary: true });
    const groomer = await client.post('/api/contacts', { kind: 'toiletteur', name: 'Toilettage', primary: true });
    expect(await groomer.json()).toMatchObject({ primary: false });

    const list = (await (await client.get('/api/contacts')).json()) as { id: string; name: string; primary: boolean }[];
    expect(list.filter((c) => c.primary).map((c) => c.name)).toEqual(['Dr Petit']);
    expect(list.find((c) => c.id === first.id)?.primary).toBe(false);
  });

  it('refuse un téléphone ou un e-mail invalide', async () => {
    const { client } = await setupOwner();
    await client.put('/api/dog', EKO);
    expect((await client.post('/api/contacts', { ...VET, phone: 'demain' })).status).toBe(400);
    expect((await client.post('/api/contacts', { ...VET, email: 'pas-un-mail' })).status).toBe(400);
  });
});
