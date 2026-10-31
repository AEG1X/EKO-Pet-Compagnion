import { describe, expect, it } from 'vitest';
import { expectPrivateRoute, setupOwner } from './client';

const VACCIN = { kind: 'vaccin', date: '2026-03-01', title: 'CHPPiL + rage', nextDueDate: '2027-03-01' };
const TRAITEMENT = { name: 'Métacam', dosage: '1,5 mg', frequency: '1 fois par jour', startDate: '2026-10-20', endDate: '2026-10-27' };

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  return ctx;
}

describe('accès aux données de santé', () => {
  it.each([
    ['GET', '/api/health-events', undefined],
    ['POST', '/api/health-events', VACCIN],
    ['PUT', '/api/health-events/x', VACCIN],
    ['DELETE', '/api/health-events/x', undefined],
    ['GET', '/api/treatments', undefined],
    ['POST', '/api/treatments', TRAITEMENT],
    ['PUT', '/api/treatments/x', TRAITEMENT],
    ['DELETE', '/api/treatments/x', undefined],
    ['GET', '/api/weights', undefined],
    ['POST', '/api/weights', { date: '2026-10-01', grams: 23000 }],
    ['DELETE', '/api/weights/x', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method, path, body);
  });

  it('le contrôle de santé public reste accessible', async () => {
    const { TestClient } = await import('./client');
    expect((await new TestClient().get('/api/health')).status).toBe(200);
  });
});

describe('soins', () => {
  it('enregistre un vaccin lié au vétérinaire, le modifie puis le supprime', async () => {
    const { client } = await ownerWithDog();
    const vet = (await (await client.post('/api/contacts', { kind: 'veterinaire', name: 'Dr Martin' })).json()) as { id: string };
    const created = await client.post('/api/health-events', { ...VACCIN, contactId: vet.id });
    expect(created.status).toBe(201);
    const event = (await created.json()) as { id: string };
    expect(event).toMatchObject({ ...VACCIN, contactName: 'Dr Martin', notes: null });

    await client.post('/api/health-events', { kind: 'consultation', date: '2026-06-10', title: 'Otite' });
    const list = (await (await client.get('/api/health-events')).json()) as { title: string }[];
    expect(list.map((e) => e.title)).toEqual(['Otite', 'CHPPiL + rage']);

    const edited = await client.put(`/api/health-events/${event.id}`, { ...VACCIN, notes: 'Lot 42' });
    expect(await edited.json()).toMatchObject({ notes: 'Lot 42', contactId: null });
    expect((await client.delete(`/api/health-events/${event.id}`)).status).toBe(200);
    expect((await client.delete(`/api/health-events/${event.id}`)).status).toBe(404);
  });

  it('garde le soin quand le contact est supprimé', async () => {
    const { client } = await ownerWithDog();
    const vet = (await (await client.post('/api/contacts', { kind: 'veterinaire', name: 'Dr Martin' })).json()) as { id: string };
    await client.post('/api/health-events', { ...VACCIN, contactId: vet.id });
    await client.delete(`/api/contacts/${vet.id}`);
    const [event] = (await (await client.get('/api/health-events')).json()) as { contactId: string | null }[];
    expect(event).toMatchObject({ contactId: null, contactName: null });
  });

  it('refuse un contact inconnu ou une échéance avant le soin', async () => {
    const { client } = await ownerWithDog();
    expect((await client.post('/api/health-events', { ...VACCIN, contactId: 'inconnu' })).status).toBe(400);
    expect((await client.post('/api/health-events', { ...VACCIN, nextDueDate: '2025-01-01' })).status).toBe(400);
  });
});

describe('traitements', () => {
  it('ajoute, modifie et supprime un traitement', async () => {
    const { client } = await ownerWithDog();
    const created = await client.post('/api/treatments', TRAITEMENT);
    expect(created.status).toBe(201);
    const t = (await created.json()) as { id: string };
    const edited = await client.put(`/api/treatments/${t.id}`, { ...TRAITEMENT, endDate: '' });
    expect(await edited.json()).toMatchObject({ endDate: null });
    expect((await client.delete(`/api/treatments/${t.id}`)).status).toBe(200);
    expect(await (await client.get('/api/treatments')).json()).toEqual([]);
  });
});

describe('poids', () => {
  it('trie par date et remplace la pesée d’un même jour', async () => {
    const { client } = await ownerWithDog();
    await client.post('/api/weights', { date: '2026-10-01', grams: 23000 });
    await client.post('/api/weights', { date: '2026-09-01', grams: 22500 });
    await client.post('/api/weights', { date: '2026-10-01', grams: 23200 });
    const list = (await (await client.get('/api/weights')).json()) as { date: string; grams: number }[];
    expect(list.map((w) => [w.date, w.grams])).toEqual([
      ['2026-09-01', 22500],
      ['2026-10-01', 23200],
    ]);
  });

  it('refuse un poids absurde ou une date future', async () => {
    const { client } = await ownerWithDog();
    expect((await client.post('/api/weights', { date: '2026-10-01', grams: 0 })).status).toBe(400);
    expect((await client.post('/api/weights', { date: '2999-01-01', grams: 20000 })).status).toBe(400);
  });

  it('exige un profil existant', async () => {
    const { client } = await setupOwner();
    expect((await client.post('/api/weights', { date: '2026-10-01', grams: 23000 })).status).toBe(409);
  });
});
