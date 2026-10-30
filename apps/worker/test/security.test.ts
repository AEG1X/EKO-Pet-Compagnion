import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ORIGIN, TestClient, setupOwner } from './client';

describe('en-têtes de sécurité', () => {
  it('appliqués aux réponses de l’API', async () => {
    const res = await new TestClient().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('appliqués aussi aux pages de l’application', async () => {
    const res = await new TestClient().get('/');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });
});

describe('protection CSRF', () => {
  it('refuse une écriture sans en-tête Origin', async () => {
    const res = await new TestClient().request('POST', '/api/auth/login/options', {}, { origin: '' });
    expect(res.status).toBe(403);
  });

  it('refuse une écriture venant d’un autre site', async () => {
    const res = await new TestClient().request('POST', '/api/auth/login/options', {}, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('refuse un corps envoyé comme formulaire HTML', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/auth/recovery`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'code=ABCD-EFGH-JKMN',
    });
    expect(res.status).toBe(415);
  });
});

describe('routes privées', () => {
  it.each(['/api/me', '/api/settings', '/api/passkeys', '/api/recovery-codes'])('%s exige une session', async (path) => {
    const res = await new TestClient().get(path);
    expect(res.status).toBe(401);
  });

  it('refuse un cookie de session forgé', async () => {
    const client = new TestClient();
    client.cookie = '__Host-eko_session=faux-jeton';
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('renvoie un 404 JSON pour une route API inconnue', async () => {
    const { client } = await setupOwner();
    const res = await client.get('/api/inexistante');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });
});
