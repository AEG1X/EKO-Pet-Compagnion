import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TestClient, addPasskey, login, newAuthenticator, setupOwner } from './client';

describe('première configuration', () => {
  it('indique qu’une configuration est nécessaire', async () => {
    const res = await new TestClient().get('/api/auth/setup/status');
    expect(await res.json()).toEqual({ needsSetup: true });
  });

  it('refuse un jeton de configuration invalide', async () => {
    const res = await new TestClient().post('/api/auth/setup/options', {
      setupToken: 'mauvais-jeton-de-configuration',
      displayName: 'Intrus',
    });
    expect(res.status).toBe(403);
  });

  it('crée le compte, une session et 10 codes de secours', async () => {
    const { client, recoveryCodes } = await setupOwner();
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const me = await client.get('/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      owner: { displayName: 'Johan' },
      sessionKind: 'full',
      pinEnabled: false,
      locked: false,
      settings: { theme: 'system', accent: 'foret' },
    });
    const status = await new TestClient().get('/api/auth/setup/status');
    expect(await status.json()).toEqual({ needsSetup: false });
  });

  it('pose un cookie __Host- HttpOnly, Secure et SameSite=Strict', async () => {
    const client = new TestClient();
    const authenticator = newAuthenticator();
    const start = await client.post('/api/auth/setup/options', { setupToken: env.SETUP_TOKEN, displayName: 'Johan' });
    const { challengeId, options } = (await start.json()) as never as {
      challengeId: string;
      options: { challenge: string; user: { id: string } };
    };
    const res = await client.post('/api/auth/setup/verify', {
      challengeId,
      response: await authenticator.createCredential(options),
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-eko_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('ne peut pas être rejouée une fois le compte créé', async () => {
    await setupOwner();
    const res = await new TestClient().post('/api/auth/setup/options', {
      setupToken: env.SETUP_TOKEN,
      displayName: 'Second',
    });
    expect(res.status).toBe(409);
  });

  it('refuse de réutiliser un défi', async () => {
    const client = new TestClient();
    const authenticator = newAuthenticator();
    const start = await client.post('/api/auth/setup/options', { setupToken: env.SETUP_TOKEN, displayName: 'Johan' });
    const { challengeId, options } = (await start.json()) as never as {
      challengeId: string;
      options: { challenge: string; user: { id: string } };
    };
    const response = await authenticator.createCredential(options);
    expect((await client.post('/api/auth/setup/verify', { challengeId, response })).status).toBe(200);
    expect((await client.post('/api/auth/setup/verify', { challengeId, response })).status).toBe(400);
  });
});

describe('connexion par passkey', () => {
  it('ouvre une nouvelle session', async () => {
    const { authenticator } = await setupOwner();
    const other = new TestClient();
    const res = await login(other, authenticator);
    expect(res.status).toBe(200);
    expect((await other.get('/api/settings')).status).toBe(200);
  });

  it('refuse une signature falsifiée', async () => {
    const { authenticator } = await setupOwner();
    const other = new TestClient();
    expect((await login(other, authenticator, true)).status).toBe(401);
    expect((await other.get('/api/me')).status).toBe(401);
  });

  it('refuse une passkey inconnue', async () => {
    await setupOwner();
    const stranger = newAuthenticator();
    await stranger.createCredential({ challenge: 'x', user: { id: 'eA' } });
    expect((await login(new TestClient(), stranger)).status).toBe(401);
  });

  it('la déconnexion invalide la session', async () => {
    const { client } = await setupOwner();
    const cookie = client.cookie;
    expect((await client.post('/api/auth/logout')).status).toBe(200);
    const replay = new TestClient();
    replay.cookie = cookie;
    expect((await replay.get('/api/me')).status).toBe(401);
  });
});

describe('codes de secours', () => {
  it('ouvrent une session limitée, à usage unique', async () => {
    const { recoveryCodes } = await setupOwner();
    const rescue = new TestClient();
    const code = recoveryCodes[0]!.toLowerCase();
    expect((await rescue.post('/api/auth/recovery', { code })).status).toBe(200);
    const me = await rescue.get('/api/me');
    expect(await me.json()).toMatchObject({ sessionKind: 'recovery' });
    // Pas d'accès aux données tant qu'une nouvelle passkey n'est pas enregistrée.
    expect((await rescue.get('/api/settings')).status).toBe(403);
    // Le même code ne fonctionne qu'une fois.
    expect((await new TestClient().post('/api/auth/recovery', { code })).status).toBe(401);
  });

  it('permettent d’enregistrer une nouvelle passkey puis ferment toutes les sessions', async () => {
    const { client, recoveryCodes } = await setupOwner();
    const rescue = new TestClient();
    await rescue.post('/api/auth/recovery', { code: recoveryCodes[1] });
    const newDevice = newAuthenticator();
    const res = await addPasskey(rescue, newDevice, 'Nouveau téléphone');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reloginRequired: true });
    expect((await client.get('/api/me')).status).toBe(401);
    expect((await rescue.get('/api/me')).status).toBe(401);
    expect((await login(new TestClient(), newDevice)).status).toBe(200);
  });

  it('sont limités en nombre de tentatives', async () => {
    await setupOwner();
    const attacker = new TestClient();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await attacker.post('/api/auth/recovery', { code: 'AAAA-BBBB-CCCC' })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('peuvent être régénérés, ce qui invalide les anciens', async () => {
    const { client, recoveryCodes } = await setupOwner();
    const res = await client.post('/api/recovery-codes/regenerate');
    expect(((await res.json()) as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);
    expect((await new TestClient().post('/api/auth/recovery', { code: recoveryCodes[2] })).status).toBe(401);
  });
});

describe('gestion des passkeys', () => {
  it('ajoute une passkey et refuse de supprimer la dernière', async () => {
    const { client } = await setupOwner();
    const list1 = (await (await client.get('/api/passkeys')).json()) as { id: string }[];
    expect(list1).toHaveLength(1);
    expect((await client.delete(`/api/passkeys/${encodeURIComponent(list1[0]!.id)}`)).status).toBe(409);

    const second = newAuthenticator();
    expect((await addPasskey(client, second, 'Mac')).status).toBe(200);
    const list2 = (await (await client.get('/api/passkeys')).json()) as { id: string; label: string }[];
    expect(list2.map((p) => p.label).sort()).toEqual(['Mac', 'Premier appareil']);
    const first = list2.find((p) => p.label === 'Premier appareil')!;
    expect((await client.delete(`/api/passkeys/${encodeURIComponent(first.id)}`)).status).toBe(200);
  });
});

describe('procédure d’urgence', () => {
  it('effacer les passkeys rouvre la configuration en conservant le compte et ses réglages', async () => {
    const { client } = await setupOwner();
    await client.patch('/api/settings', { accent: 'miel' });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM passkey'),
      env.DB.prepare('DELETE FROM session'),
      env.DB.prepare('DELETE FROM recovery_code'),
    ]);
    expect(await (await new TestClient().get('/api/auth/setup/status')).json()).toEqual({ needsSetup: true });
    const again = await setupOwner();
    expect(await (await again.client.get('/api/me')).json()).toMatchObject({ settings: { accent: 'miel' } });
    const owners = await env.DB.prepare('SELECT COUNT(*) AS n FROM owner').first<{ n: number }>();
    expect(owners?.n).toBe(1);
  });
});
