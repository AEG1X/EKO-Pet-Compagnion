import {
  type CalendarFeedCreated,
  type CalendarFeedStatus,
  HEALTH_EVENT_LABELS,
  MILESTONE_LABELS,
  type HealthEvent,
  type Reminder,
  addDays,
  addMonths,
  litterMilestones,
  nextOccurrence,
  occurrences,
  reminderInputSchema,
  upcomingDue,
} from '@eko/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv } from '../env';
import { checkSameDog, dogCrud } from '../lib/crud';
import { randomToken, sha256 } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { type IcsEvent, buildCalendar } from '../lib/ics';
import { findDog, requireDog } from './dog';
import { findLitter } from './parents';

type ReminderRow = typeof schema.reminder.$inferSelect;

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    date: row.date,
    time: row.time,
    recurrence: row.recurrence,
    notifyDaysBefore: row.notifyDaysBefore,
    healthEventId: row.healthEventId,
    notes: row.notes,
    doneDate: row.doneDate,
  };
}

/** Date du jour en France, AAAA-MM-JJ : c'est elle qui compte pour les rappels. */
export function todayInParis(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

const reminderCrud = dogCrud({
  table: schema.reminder,
  input: reminderInputSchema,
  toDto: toReminder,
  orderBy: (t) => [asc(t.date), asc(t.time)],
  notFound: 'Rappel introuvable.',
  beforeWrite: async (c, dogId, input) => {
    await checkSameDog(c.get('db'), schema.healthEvent, dogId, input.healthEventId, 'Soin introuvable.');
  },
});

/** Événements du calendrier : rappels à venir (récurrences dépliées) et échéances de santé. */
async function calendarEvents(db: Db, dog: { id: string; birthDate: string | null }, withNotes: boolean, today: string): Promise<IcsEvent[]> {
  const dogId = dog.id;
  const from = addDays(today, -90);
  const to = addMonths(today, 18);
  const reminders = await db.select().from(schema.reminder).where(eq(schema.reminder.dogId, dogId));
  const events: IcsEvent[] = [];
  for (const r of reminders) {
    if (r.doneDate) continue;
    for (const date of occurrences(r, from, to)) {
      events.push({
        uid: `rappel-${r.id}-${date}@eko`,
        title: r.title,
        date,
        time: r.time,
        description: withNotes ? r.notes : null,
        alarmDaysBefore: r.notifyDaysBefore,
      });
    }
  }
  const health = (await db
    .select({
      id: schema.healthEvent.id,
      kind: schema.healthEvent.kind,
      date: schema.healthEvent.date,
      title: schema.healthEvent.title,
      contactId: schema.healthEvent.contactId,
      nextDueDate: schema.healthEvent.nextDueDate,
      notes: schema.healthEvent.notes,
    })
    .from(schema.healthEvent)
    .where(eq(schema.healthEvent.dogId, dogId))
    .orderBy(desc(schema.healthEvent.date))) as Omit<HealthEvent, 'contactName'>[];
  for (const e of upcomingDue(health.map((h) => ({ ...h, contactName: null })), today)) {
    if (e.nextDueDate! > to) continue;
    events.push({
      uid: `echeance-${e.id}@eko`,
      title: `${HEALTH_EVENT_LABELS[e.kind]} à refaire : ${e.title}`,
      date: e.nextDueDate!,
      time: null,
      alarmDaysBefore: 7,
    });
  }
  // Jalons de la portée (saillie, naissance, arrivée) : les estimations sont signalées comme telles.
  for (const m of litterMilestones(await findLitter(db, dogId), dog.birthDate)) {
    if (m.date < from || m.date > to) continue;
    events.push({
      uid: `portee-${m.kind}@eko`,
      title: `${MILESTONE_LABELS[m.kind]}${m.estimated ? ' (estimation)' : ''}`,
      date: m.date,
      time: null,
      alarmDaysBefore: m.approximate ? null : m.kind === 'arrivee' ? 7 : 1,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export const reminderRoutes = new Hono<AppEnv>()
  .route('/reminders', reminderCrud)
  .use('*', loadSession, requireFullSession, requireUnlocked)

  // Fait : un rappel récurrent passe à sa prochaine occurrence à venir, un rappel ponctuel est coché.
  .post('/reminders/:id/done', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const where = and(eq(schema.reminder.id, c.req.param('id')), eq(schema.reminder.dogId, dog.id));
    const row = await db.select().from(schema.reminder).where(where).get();
    if (!row) throw apiError(404, 'not_found', 'Rappel introuvable.');
    const today = todayInParis();
    let change: Partial<ReminderRow>;
    if (row.recurrence === 'none') {
      change = { doneDate: today };
    } else {
      const anchorDay = Number(row.date.slice(8, 10));
      let next = nextOccurrence(row.date, row.recurrence, anchorDay)!;
      while (next <= today) next = nextOccurrence(next, row.recurrence, anchorDay)!;
      change = { date: next };
    }
    await db.update(schema.reminder).set({ ...change, updatedAt: Date.now() }).where(where);
    return c.json(toReminder((await db.select().from(schema.reminder).where(where).get())!));
  })

  // Annule « fait » sur un rappel ponctuel.
  .delete('/reminders/:id/done', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const where = and(eq(schema.reminder.id, c.req.param('id')), eq(schema.reminder.dogId, dog.id));
    const updated = await db.update(schema.reminder).set({ doneDate: null, updatedAt: Date.now() }).where(where).returning();
    if (!updated[0]) throw apiError(404, 'not_found', 'Rappel introuvable.');
    return c.json(toReminder(updated[0]));
  })

  // Export ponctuel (fichier .ics à importer), notes comprises.
  .get('/calendar.ics', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    const events = dog ? await calendarEvents(c.get('db'), dog, true, todayInParis()) : [];
    return c.body(buildCalendar(dog ? `EKO · ${dog.name}` : 'EKO', events), 200, {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="eko.ics"',
    });
  })

  // ---------- Lien d'abonnement ----------
  .get('/calendar-feed', async (c) => {
    const row = await c
      .get('db')
      .select()
      .from(schema.calendarFeed)
      .where(eq(schema.calendarFeed.ownerId, c.get('session').ownerId))
      .get();
    const status: CalendarFeedStatus = {
      active: Boolean(row),
      createdAt: row ? new Date(row.createdAt).toISOString() : null,
      lastUsedAt: row?.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    };
    return c.json(status);
  })

  // Crée le lien, ou le remplace : l'ancien cesse aussitôt de fonctionner.
  .post('/calendar-feed', async (c) => {
    const ownerId = c.get('session').ownerId;
    const token = randomToken();
    const row = { ownerId, tokenHash: await sha256(token), createdAt: Date.now(), lastUsedAt: null };
    await c
      .get('db')
      .insert(schema.calendarFeed)
      .values(row)
      .onConflictDoUpdate({ target: schema.calendarFeed.ownerId, set: { tokenHash: row.tokenHash, createdAt: row.createdAt, lastUsedAt: null } });
    const created: CalendarFeedCreated = { url: `${c.env.ORIGIN}/api/calendar/feed/${token}.ics` };
    return c.json(created, 201);
  })

  .delete('/calendar-feed', async (c) => {
    await c.get('db').delete(schema.calendarFeed).where(eq(schema.calendarFeed.ownerId, c.get('session').ownerId));
    return c.json({ ok: true });
  });

/**
 * Abonnement public, lu par Apple Calendrier ou Google Agenda sans session : le jeton de 256 bits
 * fait office de clé. Il ne contient que les titres et dates, jamais les notes.
 */
export const calendarFeedRoutes = new Hono<AppEnv>().get('/calendar/feed/:file', async (c) => {
  const match = /^([A-Za-z0-9_-]{43})\.ics$/.exec(c.req.param('file'));
  const notFound = () => c.json({ error: 'not_found', message: 'Calendrier introuvable.' }, 404);
  if (!match) return notFound();
  const db = c.get('db');
  const feed = await db
    .select()
    .from(schema.calendarFeed)
    .where(eq(schema.calendarFeed.tokenHash, await sha256(match[1]!)))
    .get();
  if (!feed) return notFound();
  const now = Date.now();
  // Trace de la dernière lecture, mise à jour au plus une fois par heure.
  if (!feed.lastUsedAt || now - feed.lastUsedAt > 3_600_000) {
    await db.update(schema.calendarFeed).set({ lastUsedAt: now }).where(eq(schema.calendarFeed.ownerId, feed.ownerId));
  }
  const dog = await findDog(db, feed.ownerId);
  const events = dog ? await calendarEvents(db, dog, false, todayInParis()) : [];
  return c.body(buildCalendar(dog ? `EKO · ${dog.name}` : 'EKO', events), 200, {
    'content-type': 'text/calendar; charset=utf-8',
  });
});
