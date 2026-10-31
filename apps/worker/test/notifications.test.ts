import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../src/lib/crypto';
import { getDb } from '../src/db/client';
import { sendDailyDigests } from '../src/routes/notifications';
import { app } from '../src/index';
import { ORIGIN, expectPrivateRoute, setupOwner } from './client';

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
  label: 'iPhone',
};

/** 1er novembre 2026, 8 h à Paris (heure d'hiver, UTC+1). */
const EIGHT_AM = new Date('2026-11-01T07:00:00Z');

async function realKeys() {
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const vapid = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  const raw = (k: CryptoKey) => crypto.subtle.exportKey('raw', k).then((b) => toBase64Url(new Uint8Array(b as ArrayBuffer)));
  return {
    p256dh: await raw(ua.publicKey),
    vapidPublic: await raw(vapid.publicKey),
    vapidPrivate: ((await crypto.subtle.exportKey('jwk', vapid.privateKey)) as JsonWebKey).d!,
  };
}

async function ownerWithReminder() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  await ctx.client.post('/api/reminders', { title: 'Brossage', kind: 'toilettage', date: '2026-11-01', recurrence: 'none', notifyDaysBefore: 0 });
  return ctx;
}

function recorder(status = 201) {
  const calls: { url: string; body: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: typeof init.body === 'string' ? init.body : '' });
    if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: {} });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe('accès aux notifications', () => {
  it.each([
    ['GET', '/api/notifications', undefined],
    ['POST', '/api/notifications/push', SUB],
    ['DELETE', '/api/notifications/push/x', undefined],
    ['POST', '/api/notifications/telegram/link', undefined],
    ['POST', '/api/notifications/telegram/confirm', undefined],
    ['DELETE', '/api/notifications/telegram', undefined],
    ['POST', '/api/notifications/test', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('notifications sans configuration serveur', () => {
  it('indique que push et Telegram ne sont pas disponibles', async () => {
    const { client } = await setupOwner();
    expect(await (await client.get('/api/notifications')).json()).toMatchObject({
      push: { available: false, devices: [] },
      telegram: { available: false, linked: false },
      dailyHour: 8,
    });
    expect((await client.post('/api/notifications/push', SUB)).status).toBe(409);
    expect((await client.post('/api/notifications/telegram/link')).status).toBe(409);
    expect(await (await client.post('/api/notifications/test')).json()).toEqual({ push: 0, telegram: false });
  });
});

describe('abonnement d’un appareil', () => {
  it('enregistre, remplace puis supprime un appareil, et refuse un service inconnu', async () => {
    const { client } = await setupOwner();
    const keys = await realKeys();
    const configured = { ...env, VAPID_PUBLIC_KEY: keys.vapidPublic, VAPID_PRIVATE_KEY: keys.vapidPrivate };
    const call = (method: string, path: string, body?: unknown) =>
      app.request(
        path,
        {
          method,
          headers: { origin: ORIGIN, cookie: client.cookie!, 'cf-connecting-ip': client.ip, 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
        configured,
      );
    expect((await call('POST', '/api/notifications/push', SUB)).status).toBe(201);
    expect((await call('POST', '/api/notifications/push', { ...SUB, label: 'iPhone de Johan' })).status).toBe(201);
    const status = (await (await call('GET', '/api/notifications')).json()) as { push: { available: boolean; publicKey: string; devices: { id: string; label: string }[] } };
    expect(status.push).toMatchObject({ available: true, publicKey: keys.vapidPublic });
    expect(status.push.devices.map((d) => d.label)).toEqual(['iPhone de Johan']);
    expect((await call('POST', '/api/notifications/push', { ...SUB, endpoint: 'https://evil.example/push' })).status).toBe(400);
    expect((await call('DELETE', `/api/notifications/push/${status.push.devices[0]!.id}`)).status).toBe(200);
    expect((await call('DELETE', `/api/notifications/push/${status.push.devices[0]!.id}`)).status).toBe(404);
  });
});

describe('récapitulatif de 8 h', () => {
  it('envoie une notification chiffrée une seule fois par jour et oublie un appareil disparu', async () => {
    await ownerWithReminder();
    const keys = await realKeys();
    const db = getDb(env.DB);
    const owner = await db.query.owner.findFirst();
    await db.insert((await import('../src/db/schema')).pushSubscription).values([
      { id: 's1', ownerId: owner!.id, endpoint: SUB.endpoint, p256dh: keys.p256dh, auth: SUB.keys.auth, label: 'iPhone', createdAt: 0 },
      { id: 's2', ownerId: owner!.id, endpoint: 'https://fcm.googleapis.com/fcm/send/old', p256dh: keys.p256dh, auth: SUB.keys.auth, label: 'Ancien', createdAt: 0 },
    ]);
    const testEnv = { ...env, VAPID_PUBLIC_KEY: keys.vapidPublic, VAPID_PRIVATE_KEY: keys.vapidPrivate };
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: url.endsWith('/old') ? 410 : 201 });
    }) as unknown as typeof fetch;

    // 7 h à Paris : rien.
    await sendDailyDigests(testEnv, db, new Date('2026-11-01T06:00:00Z'), fetcher);
    expect(calls).toHaveLength(0);

    await sendDailyDigests(testEnv, db, EIGHT_AM, fetcher);
    expect(calls.sort()).toEqual([SUB.endpoint, 'https://fcm.googleapis.com/fcm/send/old'].sort());
    const runs = await env.DB.prepare('SELECT day, summary FROM notification_run').all();
    expect(runs.results).toEqual([{ day: '2026-11-01', summary: 'push:1' }]);
    const left = await env.DB.prepare('SELECT id FROM push_subscription').all();
    expect(left.results).toEqual([{ id: 's1' }]);

    // Seconde exécution le même jour : aucun doublon.
    await sendDailyDigests(testEnv, db, new Date('2026-11-01T07:30:00Z'), fetcher);
    expect(calls).toHaveLength(2);
  });

  it('se rabat sur Telegram quand aucune notification push ne part', async () => {
    await ownerWithReminder();
    const db = getDb(env.DB);
    const owner = await db.query.owner.findFirst();
    await env.DB.prepare("INSERT INTO telegram_link (owner_id, chat_id, linked_at) VALUES (?, '4242', 0)").bind(owner!.id).run();
    const { calls, fetcher } = recorder();
    await sendDailyDigests({ ...env, TELEGRAM_BOT_TOKEN: '123:abc' }, db, EIGHT_AM, fetcher);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ chat_id: '4242', text: expect.stringContaining('Aujourd’hui · Brossage') });
  });

  it('ne dit rien sans rappel du jour', async () => {
    const { client } = await setupOwner();
    await client.put('/api/dog', { name: 'Eko' });
    const { calls, fetcher } = recorder();
    await sendDailyDigests({ ...env, TELEGRAM_BOT_TOKEN: '123:abc' }, getDb(env.DB), EIGHT_AM, fetcher);
    expect(calls).toHaveLength(0);
    expect((await env.DB.prepare('SELECT * FROM notification_run').all()).results).toHaveLength(0);
  });
});
