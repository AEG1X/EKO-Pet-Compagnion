import { type LostStatus, type MedalStatus, REPORT_RETENTION_DAYS, finderReportSchema } from '@eko/shared';
import { SELF, env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb, schema } from '../src/db/client';
import { alertScan, purgeOldReports, recordReport } from '../src/routes/lost';
import { loadPublicMedal } from '../src/routes/medal';
import { ORIGIN, type TestClient, expectPrivateRoute, setupOwner } from './client';

async function lostDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  await ctx.client.put('/api/medal/settings', {
    showPhoto: true,
    showAge: true,
    showArea: true,
    showVet: true,
    showPhone: true,
    phone: '06 12 34 56 78',
  });
  const medal = (await (await ctx.client.post('/api/medal/link')).json()) as MedalStatus;
  const path = new URL(medal.url!).pathname;
  return { ...ctx, path };
}

async function declareLost(client: TestClient, message = 'Perdu près du parc') {
  const res = await client.post('/api/lost', { message });
  expect(res.status).toBe(201);
  return (await res.json()) as LostStatus;
}

function report(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return SELF.fetch(`${ORIGIN}${path}/signaler`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'cf-connecting-ip': '198.51.100.7', ...headers },
    body: new URLSearchParams(fields),
  });
}

function recorder() {
  const calls: { url: string; body: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: typeof init.body === 'string' ? init.body : '' });
    return Response.json({ ok: true, result: {} });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

async function linkTelegram() {
  const db = getDb(env.DB);
  const owner = await db.query.owner.findFirst();
  await env.DB.prepare("INSERT INTO telegram_link (owner_id, chat_id, linked_at) VALUES (?, '4242', 0)").bind(owner!.id).run();
}

describe('accès au mode perdu', () => {
  it.each([
    ['GET', '/api/lost', undefined],
    ['POST', '/api/lost', { message: null }],
    ['DELETE', '/api/lost', undefined],
    ['DELETE', '/api/lost/reports/x', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('mode perdu', () => {
  it('affiche l’alerte et le formulaire sur la fiche, puis les retire une fois retrouvé', async () => {
    const { client, path } = await lostDog();
    expect(await (await SELF.fetch(`${ORIGIN}${path}`)).text()).not.toContain('Je suis perdu');

    await declareLost(client);
    const res = await SELF.fetch(`${ORIGIN}${path}`);
    expect(res.headers.get('permissions-policy')).toContain('geolocation=(self)');
    // Sans cela, le navigateur envoie « Origin: null » et le formulaire serait refusé.
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    const html = await res.text();
    expect(html).toContain('Je suis perdu');
    expect(html).toContain('Perdu près du parc');
    expect(html).toContain(`action="${path}/signaler"`);
    expect(html).toContain('<script src="/medal.js" defer></script>');

    const found = (await (await client.delete('/api/lost')).json()) as LostStatus;
    expect(found.current).toBeNull();
    expect(found.history).toHaveLength(1);
    expect(await (await SELF.fetch(`${ORIGIN}${path}`)).text()).not.toContain('Je suis perdu');
  });

  it('n’autorise la géolocalisation que sur la fiche publique', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/health`);
    expect(res.headers.get('permissions-policy')).toContain('geolocation=()');
  });

  it('enregistre un signalement avec ou sans position', async () => {
    const { client, path } = await lostDog();
    await declareLost(client);

    const withPosition = await report(path, { message: 'Vu rue Garibaldi', contact: '07 00 00 00 00', latitude: '45.75', longitude: '4.85', accuracy: '12' });
    expect(withPosition.status).toBe(200);
    expect(await withPosition.text()).toContain('vient d’être prévenue');
    expect((await report(path, { message: 'Il court vers le pont' })).status).toBe(200);

    const status = (await (await client.get('/api/lost')).json()) as LostStatus;
    expect(status.current?.reportCount).toBe(2);
    expect(status.reports).toHaveLength(2);
    const located = status.reports.find((r) => r.position);
    expect(located).toMatchObject({ message: 'Vu rue Garibaldi', contact: '07 00 00 00 00', position: { latitude: 45.75, longitude: 4.85, accuracy: 12 } });

    const after = (await (await client.delete(`/api/lost/reports/${located!.id}`)).json()) as LostStatus;
    expect(after.reports).toHaveLength(1);
  });

  it('refuse un signalement vide, d’une autre origine, ou hors mode perdu', async () => {
    const { client, path } = await lostDog();
    expect((await report(path, { message: 'Vu' })).status).toBe(409);
    await declareLost(client);
    expect((await report(path, { message: '' })).status).toBe(400);
    expect((await report(path, { latitude: '45.7' })).status).toBe(400);
    expect((await report(path, { message: 'Vu' }, { origin: 'https://evil.example' })).status).toBe(403);
    const status = (await (await client.get('/api/lost')).json()) as LostStatus;
    expect(status.reports).toHaveLength(0);
  });

  it('ignore les robots et limite les signalements répétés', async () => {
    const { client, path } = await lostDog();
    await declareLost(client);
    expect((await report(path, { message: 'spam', website: 'http://spam' })).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await report(path, { message: `Vu ${i}` })).status).toBe(200);
    expect((await report(path, { message: 'encore' })).status).toBe(429);
    const status = (await (await client.get('/api/lost')).json()) as LostStatus;
    expect(status.reports).toHaveLength(5);
  });

  it('prévient le propriétaire par Telegram à chaque signalement, même si le push a fonctionné', async () => {
    const { client, path } = await lostDog();
    await declareLost(client);
    await linkTelegram();
    const db = getDb(env.DB);
    const loaded = await loadPublicMedal(db, eq(schema.medal.publicId, path.slice(3)));
    const { calls, fetcher } = recorder();
    await recordReport(
      { ...env, TELEGRAM_BOT_TOKEN: '123:abc' },
      db,
      loaded!,
      { message: 'Vu au parc', contact: null, latitude: 45.75, longitude: 4.85, accuracy: 10 },
      fetcher,
    );
    expect(calls).toHaveLength(1);
    const text = JSON.parse(calls[0]!.body).text as string;
    expect(text).toContain('Signalement pour Eko');
    expect(text).toContain('Vu au parc');
    expect(text).toContain('openstreetmap.org/?mlat=45.75000&mlon=4.85000');
  });

  it('signale un scan au plus une fois par quart d’heure', async () => {
    const { client, path } = await lostDog();
    await declareLost(client);
    await linkTelegram();
    const db = getDb(env.DB);
    const testEnv = { ...env, TELEGRAM_BOT_TOKEN: '123:abc' };
    const { calls, fetcher } = recorder();
    const load = async () => (await loadPublicMedal(db, eq(schema.medal.publicId, path.slice(3))))!;
    const now = Date.now();
    await alertScan(testEnv, db, await load(), now, fetcher);
    await alertScan(testEnv, db, await load(), now + 60_000, fetcher);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.body).text).toContain('vient d’être scannée');
    await alertScan(testEnv, db, await load(), now + 16 * 60_000, fetcher);
    expect(calls).toHaveLength(2);
  });

  it('efface signalements et positions 30 jours après la fin du mode perdu', async () => {
    const { client, path } = await lostDog();
    await declareLost(client);
    await report(path, { message: 'Vu', latitude: '45.7', longitude: '4.8' });
    await client.delete('/api/lost');
    const db = getDb(env.DB);
    const now = Date.now();
    expect(await purgeOldReports(db, now + (REPORT_RETENTION_DAYS - 1) * 86_400_000)).toBe(0);
    expect(await purgeOldReports(db, now + (REPORT_RETENTION_DAYS + 1) * 86_400_000)).toBe(1);
    expect(await db.select().from(schema.finderReport)).toHaveLength(0);
    const status = (await (await client.get('/api/lost')).json()) as LostStatus;
    expect(status.history[0]).toMatchObject({ reportCount: 1, purged: true });
  });
});

describe('validation des signalements', () => {
  it('exige un message ou une position complète', () => {
    expect(finderReportSchema.safeParse({ message: 'Vu' }).success).toBe(true);
    expect(finderReportSchema.safeParse({ latitude: '45.7', longitude: '4.8' }).success).toBe(true);
    expect(finderReportSchema.safeParse({}).success).toBe(false);
    expect(finderReportSchema.safeParse({ message: 'Vu', latitude: 120, longitude: 4 }).success).toBe(false);
  });
});
