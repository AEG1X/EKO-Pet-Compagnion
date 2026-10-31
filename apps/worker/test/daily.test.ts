import { describe, expect, it } from 'vitest';
import { expectPrivateRoute, setupOwner } from './client';

const PLAN = { food: 'Croquettes adulte grande race', dailyGrams: 320, mealsPerDay: 2, startDate: '2026-01-01' };
const SKILL = { name: 'Rappel', status: 'en_cours' };
const SESSION = { date: '2026-10-30', durationMinutes: 15 };
const EXPENSE = { date: '2026-10-30', amountCents: 6490, category: 'alimentation', label: 'Sac de croquettes 12 kg' };

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  return ctx;
}

describe('accès au quotidien', () => {
  const cases: [string, unknown][] = [
    ['/api/feeding-plans', PLAN],
    ['/api/skills', SKILL],
    ['/api/training-sessions', SESSION],
    ['/api/expenses', EXPENSE],
  ];
  it.each(cases.flatMap(([path, body]) => [
    ['GET', path, undefined],
    ['POST', path, body],
    ['PUT', `${path}/x`, body],
    ['DELETE', `${path}/x`, undefined],
  ]))('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('alimentation', () => {
  it('clôt l’alimentation précédente quand une nouvelle commence', async () => {
    const { client } = await ownerWithDog();
    const first = (await (await client.post('/api/feeding-plans', PLAN)).json()) as { id: string };
    const second = await client.post('/api/feeding-plans', { ...PLAN, food: 'Croquettes senior', startDate: '2026-10-15' });
    expect(second.status).toBe(201);
    const list = (await (await client.get('/api/feeding-plans')).json()) as { id: string; endDate: string | null }[];
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ food: 'Croquettes senior', endDate: null });
    expect(list.find((p) => p.id === first.id)?.endDate).toBe('2026-10-14');
  });

  it('modifie et supprime une alimentation', async () => {
    const { client } = await ownerWithDog();
    const plan = (await (await client.post('/api/feeding-plans', PLAN)).json()) as { id: string };
    expect(await (await client.put(`/api/feeding-plans/${plan.id}`, { ...PLAN, dailyGrams: 300 })).json()).toMatchObject({ dailyGrams: 300 });
    expect((await client.delete(`/api/feeding-plans/${plan.id}`)).status).toBe(200);
    expect((await client.put(`/api/feeding-plans/${plan.id}`, PLAN)).status).toBe(404);
  });
});

describe('éducation', () => {
  it('relie une séance à un apprentissage et efface la date d’acquisition hors statut acquis', async () => {
    const { client } = await ownerWithDog();
    const skill = (await (await client.post('/api/skills', { ...SKILL, acquiredDate: '2026-10-01' })).json()) as {
      id: string;
      acquiredDate: string | null;
    };
    expect(skill.acquiredDate).toBeNull();
    const session = await client.post('/api/training-sessions', { ...SESSION, skillId: skill.id });
    expect(await session.json()).toMatchObject({ skillId: skill.id, durationMinutes: 15 });
    expect((await client.post('/api/training-sessions', { ...SESSION, skillId: 'inconnu' })).status).toBe(400);

    const acquired = await client.put(`/api/skills/${skill.id}`, { ...SKILL, status: 'acquis', acquiredDate: '2026-10-30' });
    expect(await acquired.json()).toMatchObject({ status: 'acquis', acquiredDate: '2026-10-30' });

    // Supprimer l'apprentissage garde la séance.
    await client.delete(`/api/skills/${skill.id}`);
    const [kept] = (await (await client.get('/api/training-sessions')).json()) as { skillId: string | null }[];
    expect(kept).toMatchObject({ skillId: null });
  });
});

describe('dépenses', () => {
  it('enregistre une dépense, liée ou non à un soin', async () => {
    const { client } = await ownerWithDog();
    const care = (await (await client.post('/api/health-events', { kind: 'consultation', date: '2026-10-20', title: 'Otite' })).json()) as {
      id: string;
    };
    const created = await client.post('/api/expenses', { ...EXPENSE, category: 'sante', label: 'Consultation', healthEventId: care.id });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ healthEventId: care.id, amountCents: 6490 });
    expect((await client.post('/api/expenses', { ...EXPENSE, healthEventId: 'inconnu' })).status).toBe(400);
    expect((await client.post('/api/expenses', { ...EXPENSE, amountCents: -5 })).status).toBe(400);
  });

  it('n’expose jamais les données d’un autre chien', async () => {
    const { client } = await ownerWithDog();
    const mine = (await (await client.post('/api/expenses', EXPENSE)).json()) as { id: string };
    // Une ligne rattachée au chien d'un autre propriétaire ne doit pas être modifiable via l'API.
    const { env } = await import('cloudflare:test');
    await env.DB.prepare("INSERT INTO owner (id, display_name, webauthn_user_id, created_at) VALUES ('o2', 'Autre', 'x', 0)").run();
    await env.DB.prepare("INSERT INTO dog (id, owner_id, name, created_at, updated_at) VALUES ('autre', 'o2', 'Autre', 0, 0)").run();
    await env.DB.prepare(
      "INSERT INTO expense (id, dog_id, date, amount_cents, category, label, created_at, updated_at) VALUES ('etranger', 'autre', '2026-01-01', 100, 'autre', 'X', 0, 0)",
    ).run();
    expect((await client.put('/api/expenses/etranger', EXPENSE)).status).toBe(404);
    expect((await client.delete('/api/expenses/etranger')).status).toBe(404);
    const list = (await (await client.get('/api/expenses')).json()) as { id: string }[];
    expect(list.map((e) => e.id)).toEqual([mine.id]);
  });
});
