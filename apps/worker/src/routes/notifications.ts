import {
  DAILY_NOTIFICATION_HOUR,
  type HealthEvent,
  type NotificationStatus,
  type NotificationTestResult,
  type Reminder,
  type TelegramLinkStart,
  pushSubscriptionInputSchema,
} from '@eko/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv, Env } from '../env';
import { randomId, randomToken } from '../lib/crypto';
import { digestMessage, dueToday } from '../lib/digest';
import { apiError } from '../lib/errors';
import { botUsername, findChatForCode, sendTelegram } from '../lib/telegram';
import { readJson } from '../lib/validate';
import { type VapidKeys, isAllowedPushEndpoint, sendPush } from '../lib/webpush';
import { findDog } from './dog';
import { todayInParis } from './reminders';

/** Durée de validité d'un code de liaison Telegram. */
const LINK_CODE_TTL_MS = 15 * 60_000;

function vapidKeys(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  // Le contact demandé par les services de push : l'adresse de l'application suffit.
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.ORIGIN };
}

export interface Message {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Envoie un message sur tous les appareils abonnés. Telegram sert de secours : il n'est utilisé
 * que si aucune notification Web Push n'a pu partir, sauf pour une alerte urgente (chien perdu),
 * envoyée sur tous les canaux.
 */
export async function deliver(
  env: Env,
  db: Db,
  ownerId: string,
  message: Message,
  fetcher: typeof fetch = fetch,
  options: { urgent?: boolean } = {},
) {
  let pushed = 0;
  const vapid = vapidKeys(env);
  if (vapid) {
    const subs = await db.select().from(schema.pushSubscription).where(eq(schema.pushSubscription.ownerId, ownerId));
    for (const sub of subs) {
      let result: Awaited<ReturnType<typeof sendPush>>;
      try {
        result = await sendPush(sub, message, vapid, fetcher);
      } catch {
        result = 'failed';
      }
      if (result === 'sent') {
        pushed += 1;
        await db.update(schema.pushSubscription).set({ lastSuccessAt: Date.now() }).where(eq(schema.pushSubscription.id, sub.id));
      } else if (result === 'gone') {
        // Abonnement révoqué par le navigateur (désinstallation, permissions retirées).
        await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, sub.id));
      }
    }
  }
  let telegram = false;
  if ((pushed === 0 || options.urgent) && env.TELEGRAM_BOT_TOKEN) {
    const link = await db.select().from(schema.telegramLink).where(eq(schema.telegramLink.ownerId, ownerId)).get();
    if (link?.chatId) {
      try {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, link.chatId, `${message.title}\n\n${message.body}\n\n${env.ORIGIN}${message.url}`, fetcher);
        telegram = true;
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', task: 'telegram', message: (error as Error).message }));
      }
    }
  }
  return { push: pushed, telegram };
}

/**
 * Tâche planifiée : à 8 h (heure de Paris), un récapitulatif des rappels du jour, une seule fois par jour.
 * La tâche tourne à 6 h et 7 h UTC pour couvrir l'heure d'été et l'heure d'hiver.
 */
export async function sendDailyDigests(env: Env, db: Db, now = new Date(), fetcher: typeof fetch = fetch) {
  const parisHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(now));
  if (parisHour !== DAILY_NOTIFICATION_HOUR) return;
  const today = todayInParis(now);
  const owners = await db.select({ id: schema.owner.id }).from(schema.owner);
  for (const { id: ownerId } of owners) {
    const dog = await findDog(db, ownerId);
    if (!dog) continue;
    const already = await db
      .select()
      .from(schema.notificationRun)
      .where(and(eq(schema.notificationRun.ownerId, ownerId), eq(schema.notificationRun.day, today)))
      .get();
    if (already) continue;
    const reminders = (await db.select().from(schema.reminder).where(eq(schema.reminder.dogId, dog.id))) as Reminder[];
    const events = (
      await db.select().from(schema.healthEvent).where(eq(schema.healthEvent.dogId, dog.id))
    ).map((e) => ({ ...e, contactName: null })) as HealthEvent[];
    const items = dueToday(reminders, events, today);
    if (items.length === 0) continue;
    const result = await deliver(env, db, ownerId, digestMessage(items, today, dog.name), fetcher);
    await db.insert(schema.notificationRun).values({
      ownerId,
      day: today,
      sentAt: Date.now(),
      summary: `push:${result.push}${result.telegram ? ' telegram' : ''}`,
    });
  }
}

export const notificationRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  .get('/notifications', async (c) => {
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const vapid = vapidKeys(c.env);
    const devices = await db
      .select()
      .from(schema.pushSubscription)
      .where(eq(schema.pushSubscription.ownerId, ownerId))
      .orderBy(asc(schema.pushSubscription.createdAt));
    const link = await db.select().from(schema.telegramLink).where(eq(schema.telegramLink.ownerId, ownerId)).get();
    const status: NotificationStatus = {
      push: {
        available: Boolean(vapid),
        publicKey: vapid?.publicKey ?? null,
        devices: devices.map((d) => ({
          id: d.id,
          label: d.label,
          createdAt: new Date(d.createdAt).toISOString(),
          lastSuccessAt: d.lastSuccessAt ? new Date(d.lastSuccessAt).toISOString() : null,
        })),
      },
      telegram: { available: Boolean(c.env.TELEGRAM_BOT_TOKEN), linked: Boolean(link?.chatId) },
      dailyHour: DAILY_NOTIFICATION_HOUR,
    };
    return c.json(status);
  })

  // Abonnement de l'appareil courant ; un même navigateur réabonné remplace son ancienne entrée.
  .post('/notifications/push', async (c) => {
    const input = await readJson(c, pushSubscriptionInputSchema);
    if (!vapidKeys(c.env)) throw apiError(409, 'push_unavailable', 'Les notifications ne sont pas configurées sur le serveur.');
    if (!isAllowedPushEndpoint(input.endpoint)) throw apiError(400, 'invalid_input', 'Service de notification non reconnu.');
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const row = { ownerId, p256dh: input.keys.p256dh, auth: input.keys.auth, label: input.label };
    await db
      .insert(schema.pushSubscription)
      .values({ id: randomId(), endpoint: input.endpoint, ...row, createdAt: Date.now() })
      .onConflictDoUpdate({ target: schema.pushSubscription.endpoint, set: row });
    return c.json({ ok: true }, 201);
  })

  .delete('/notifications/push/:id', async (c) => {
    const deleted = await c
      .get('db')
      .delete(schema.pushSubscription)
      .where(and(eq(schema.pushSubscription.id, c.req.param('id')), eq(schema.pushSubscription.ownerId, c.get('session').ownerId)))
      .returning({ id: schema.pushSubscription.id });
    if (!deleted[0]) throw apiError(404, 'not_found', 'Appareil introuvable.');
    return c.json({ ok: true });
  })

  // Liaison Telegram, étape 1 : un code à usage unique, envoyé au bot par le lien t.me.
  .post('/notifications/telegram/link', async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw apiError(409, 'telegram_unavailable', 'Telegram n’est pas configuré sur le serveur.');
    let username: string;
    try {
      username = await botUsername(token);
    } catch {
      throw apiError(502, 'telegram_error', 'Telegram ne répond pas. Réessaie dans un instant.');
    }
    const code = randomToken().slice(0, 24);
    const ownerId = c.get('session').ownerId;
    const values = { linkCode: code, linkCodeExpiresAt: Date.now() + LINK_CODE_TTL_MS };
    await c
      .get('db')
      .insert(schema.telegramLink)
      .values({ ownerId, ...values })
      .onConflictDoUpdate({ target: schema.telegramLink.ownerId, set: values });
    const start: TelegramLinkStart = { url: `https://t.me/${username}?start=${code}` };
    return c.json(start);
  })

  // Étape 2 : retrouver le message « /start <code> » reçu par le bot et retenir la conversation.
  .post('/notifications/telegram/confirm', async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw apiError(409, 'telegram_unavailable', 'Telegram n’est pas configuré sur le serveur.');
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const link = await db.select().from(schema.telegramLink).where(eq(schema.telegramLink.ownerId, ownerId)).get();
    if (!link?.linkCode || !link.linkCodeExpiresAt || link.linkCodeExpiresAt < Date.now()) {
      throw apiError(410, 'link_expired', 'Code expiré : recommence la liaison.');
    }
    let chatId: string | null;
    try {
      chatId = await findChatForCode(token, link.linkCode);
    } catch {
      throw apiError(502, 'telegram_error', 'Telegram ne répond pas. Réessaie dans un instant.');
    }
    if (!chatId) throw apiError(404, 'not_found', 'Message pas encore reçu : appuie sur « Démarrer » dans Telegram, puis réessaie.');
    await db
      .update(schema.telegramLink)
      .set({ chatId, linkCode: null, linkCodeExpiresAt: null, linkedAt: Date.now() })
      .where(eq(schema.telegramLink.ownerId, ownerId));
    await sendTelegram(token, chatId, 'EKO est relié à cette conversation. Les rappels arriveront ici si les notifications du téléphone échouent.').catch(
      () => undefined,
    );
    return c.json({ ok: true });
  })

  .delete('/notifications/telegram', async (c) => {
    await c.get('db').delete(schema.telegramLink).where(eq(schema.telegramLink.ownerId, c.get('session').ownerId));
    return c.json({ ok: true });
  })

  // Essai : sur tous les appareils, et sur Telegram s'il est relié (même si le push a fonctionné).
  .post('/notifications/test', async (c) => {
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const message: Message = {
      title: 'EKO · Essai',
      body: 'Les notifications fonctionnent sur cet appareil.',
      url: '/reglages',
      tag: 'eko-essai',
    };
    const result = await deliver(c.env, db, ownerId, message);
    let telegram = result.telegram;
    if (!telegram && c.env.TELEGRAM_BOT_TOKEN) {
      const link = await db.select().from(schema.telegramLink).where(eq(schema.telegramLink.ownerId, ownerId)).get();
      if (link?.chatId) telegram = await sendTelegram(c.env.TELEGRAM_BOT_TOKEN, link.chatId, `${message.title}\n\n${message.body}`).then(
        () => true,
        () => false,
      );
    }
    const out: NotificationTestResult = { push: result.push, telegram };
    return c.json(out);
  });
