import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onAuthError } from './api';

afterEach(() => vi.restoreAllMocks());

describe('client API', () => {
  it('transforme une erreur JSON en ApiError lisible', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'pin_wrong', message: 'PIN incorrect.' }), { status: 401 }),
    );
    const listener = vi.fn();
    const off = onAuthError(listener);
    await expect(api('/auth/unlock', { method: 'POST', body: { pin: '000000' } })).rejects.toMatchObject({
      status: 401,
      code: 'pin_wrong',
      message: 'PIN incorrect.',
    });
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it('signale clairement une coupure réseau', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('network');
  });

  it('envoie le JSON avec le bon type de contenu, sur la même origine', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await api('/settings', { method: 'PATCH', body: { theme: 'dark' } });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/settings');
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'same-origin', body: '{"theme":"dark"}' });
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});
