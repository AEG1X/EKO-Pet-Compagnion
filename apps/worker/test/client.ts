import { SELF, env } from 'cloudflare:test';
import { VirtualAuthenticator } from './authenticator';

export const ORIGIN = 'http://localhost:8787';

/** Client HTTP de test avec un cookie de session, comme un navigateur. */
export class TestClient {
  cookie: string | null = null;
  ip = '203.0.113.10';

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const init: RequestInit = {
      method,
      headers: {
        origin: ORIGIN,
        'cf-connecting-ip': this.ip,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await SELF.fetch(`${ORIGIN}${path}`, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0] ?? '';
      this.cookie = /=$/.test(pair) || /Max-Age=0/i.test(setCookie) ? null : pair;
    }
    return res;
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body: unknown = {}) {
    return this.request('POST', path, body);
  }
  patch(path: string, body: unknown) {
    return this.request('PATCH', path, body);
  }
  put(path: string, body: unknown) {
    return this.request('PUT', path, body);
  }
  delete(path: string) {
    return this.request('DELETE', path);
  }

  /** Envoi brut d'un fichier, comme le fait le front (PUT /api/files). */
  async upload(bytes: Uint8Array, contentType = 'application/octet-stream', name?: string) {
    return SELF.fetch(`${ORIGIN}/api/files`, {
      method: 'PUT',
      headers: {
        origin: ORIGIN,
        'cf-connecting-ip': this.ip,
        'content-type': contentType,
        ...(name ? { 'x-file-name': encodeURIComponent(name) } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: bytes,
    });
  }
}

export function newAuthenticator() {
  return new VirtualAuthenticator(env.RP_ID, ORIGIN);
}

/** Configure le compte propriétaire avec une passkey ; renvoie le client connecté. */
export async function setupOwner() {
  const client = new TestClient();
  const authenticator = newAuthenticator();
  const start = await client.post('/api/auth/setup/options', {
    setupToken: env.SETUP_TOKEN,
    displayName: 'Johan',
  });
  if (start.status !== 200) throw new Error(`setup/options ${start.status}: ${await start.text()}`);
  const { challengeId, options } = (await start.json()) as {
    challengeId: string;
    options: { challenge: string; user: { id: string } };
  };
  const response = await authenticator.createCredential(options);
  const finish = await client.post('/api/auth/setup/verify', { challengeId, response });
  if (finish.status !== 200) throw new Error(`setup/verify ${finish.status}: ${await finish.text()}`);
  const { recoveryCodes } = (await finish.json()) as { recoveryCodes: string[] };
  return { client, authenticator, recoveryCodes };
}

export async function login(client: TestClient, authenticator: VirtualAuthenticator, tamper = false) {
  const start = await client.post('/api/auth/login/options');
  const { challengeId, options } = (await start.json()) as { challengeId: string; options: { challenge: string } };
  const response = await authenticator.getAssertion(options, tamper);
  return client.post('/api/auth/login/verify', { challengeId, response });
}

export async function addPasskey(client: TestClient, authenticator: VirtualAuthenticator, label = 'iPhone') {
  const start = await client.post('/api/passkeys/options');
  if (start.status !== 200) return start;
  const { challengeId, options } = (await start.json()) as {
    challengeId: string;
    options: { challenge: string; user: { id: string } };
  };
  const response = await authenticator.createCredential(options);
  return client.post('/api/passkeys/verify', { challengeId, response, label });
}

/**
 * Vérifie qu'une route privée refuse l'accès sans session (401), en session de récupération (403)
 * et quand le PIN verrouille la session (423). À appeler pour chaque nouvelle route privée.
 */
export async function expectPrivateRoute(method: string, path: string, body?: unknown) {
  const anonymous = await new TestClient().request(method, path, body);
  if (anonymous.status !== 401) throw new Error(`${method} ${path} sans session : ${anonymous.status} au lieu de 401`);

  const { client, recoveryCodes } = await setupOwner();
  const rescue = new TestClient();
  await rescue.post('/api/auth/recovery', { code: recoveryCodes[0] });
  const recovery = await rescue.request(method, path, body);
  if (recovery.status !== 403) throw new Error(`${method} ${path} en récupération : ${recovery.status} au lieu de 403`);

  await client.put('/api/pin', { pin: '482913' });
  await client.post('/api/auth/lock');
  const locked = await client.request(method, path, body);
  if (locked.status !== 423) throw new Error(`${method} ${path} verrouillée : ${locked.status} au lieu de 423`);
}
