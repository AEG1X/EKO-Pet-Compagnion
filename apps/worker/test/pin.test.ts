import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TestClient, login, setupOwner } from './client';

async function ownerWithPin() {
  const ctx = await setupOwner();
  expect((await ctx.client.put('/api/pin', { pin: '482913' })).status).toBe(200);
  return ctx;
}

describe('PIN de verrouillage', () => {
  it('refuse un PIN qui n’a pas 6 chiffres', async () => {
    const { client } = await setupOwner();
    expect((await client.put('/api/pin', { pin: '1234' })).status).toBe(400);
  });

  it('verrouille les données jusqu’à la saisie du bon PIN, puis change le jeton de session', async () => {
    const { client } = await ownerWithPin();
    await client.post('/api/auth/lock');
    expect((await client.get('/api/settings')).status).toBe(423);
    expect(await (await client.get('/api/me')).json()).toMatchObject({ locked: true, pinEnabled: true });

    const before = client.cookie;
    expect((await client.post('/api/auth/unlock', { pin: '482913' })).status).toBe(200);
    expect(client.cookie).not.toBe(before);
    expect((await client.get('/api/settings')).status).toBe(200);

    const stale = new TestClient();
    stale.cookie = before;
    expect((await stale.get('/api/me')).status).toBe(401);
  });

  it('se verrouille après 5 minutes d’inactivité', async () => {
    const { client } = await ownerWithPin();
    await env.DB.prepare('UPDATE session SET last_seen_at = ?').bind(Date.now() - 6 * 60 * 1000).run();
    expect((await client.get('/api/settings')).status).toBe(423);
  });

  it('bloque 15 minutes après 5 erreurs, même avec le bon PIN', async () => {
    const { client } = await ownerWithPin();
    await client.post('/api/auth/lock');
    for (let i = 0; i < 4; i++) {
      expect((await client.post('/api/auth/unlock', { pin: '000000' })).status).toBe(401);
    }
    const fifth = await client.post('/api/auth/unlock', { pin: '000000' });
    expect(fifth.status).toBe(423);
    expect(Number(fifth.headers.get('retry-after'))).toBeGreaterThan(14 * 60);
    expect((await client.post('/api/auth/unlock', { pin: '482913' })).status).toBe(423);

    // Fin du blocage simulée : le bon PIN fonctionne à nouveau.
    await env.DB.prepare('UPDATE pin SET locked_until = ?').bind(Date.now() - 1000).run();
    expect((await client.post('/api/auth/unlock', { pin: '482913' })).status).toBe(200);
  });

  it('révoque toutes les sessions après 10 erreurs', async () => {
    const { client, authenticator } = await ownerWithPin();
    await client.post('/api/auth/lock');
    let last = 0;
    for (let i = 0; i < 10; i++) {
      await env.DB.prepare('UPDATE pin SET locked_until = NULL').run();
      last = (await client.post('/api/auth/unlock', { pin: '111111' })).status;
    }
    expect(last).toBe(401);
    expect((await client.get('/api/me')).status).toBe(401);
    // La passkey permet de revenir, déverrouillé.
    const back = new TestClient();
    expect((await login(back, authenticator)).status).toBe(200);
    expect((await back.get('/api/settings')).status).toBe(200);
  });

  it('une connexion par passkey ouvre une session déverrouillée', async () => {
    const { authenticator } = await ownerWithPin();
    const other = new TestClient();
    await login(other, authenticator);
    expect(await (await other.get('/api/me')).json()).toMatchObject({ locked: false, pinEnabled: true });
  });
});
