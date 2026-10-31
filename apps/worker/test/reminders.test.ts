import { addDays } from '@eko/shared';
import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, foldLine } from '../src/lib/ics';
import { todayInParis } from '../src/routes/reminders';
import { TestClient, expectPrivateRoute, setupOwner } from './client';

const REMINDER = { title: 'Toilettage', kind: 'toilettage', date: '2026-11-10', recurrence: 'none', notifyDaysBefore: 1 };

interface ReminderDto {
  id: string;
  date: string;
  doneDate: string | null;
}

async function ownerWithDog() {
  const ctx = await setupOwner();
  await ctx.client.put('/api/dog', { name: 'Eko' });
  return ctx;
}

describe('accès aux rappels et au calendrier', () => {
  it.each([
    ['GET', '/api/reminders', undefined],
    ['POST', '/api/reminders', REMINDER],
    ['PUT', '/api/reminders/x', REMINDER],
    ['DELETE', '/api/reminders/x', undefined],
    ['POST', '/api/reminders/x/done', undefined],
    ['DELETE', '/api/reminders/x/done', undefined],
    ['GET', '/api/calendar.ics', undefined],
    ['GET', '/api/calendar-feed', undefined],
    ['POST', '/api/calendar-feed', undefined],
    ['DELETE', '/api/calendar-feed', undefined],
  ])('%s %s refuse sans session, en récupération et verrouillé', async (method, path, body) => {
    await expectPrivateRoute(method as string, path as string, body);
  });
});

describe('rappels', () => {
  it('coche un rappel ponctuel puis annule', async () => {
    const { client } = await ownerWithDog();
    const r = (await (await client.post('/api/reminders', REMINDER)).json()) as ReminderDto;
    const done = (await (await client.post(`/api/reminders/${r.id}/done`)).json()) as ReminderDto;
    expect(done.doneDate).toBe(todayInParis());
    const reopened = (await (await client.delete(`/api/reminders/${r.id}/done`)).json()) as ReminderDto;
    expect(reopened.doneDate).toBeNull();
  });

  it('fait avancer un rappel récurrent à sa prochaine occurrence à venir', async () => {
    const { client } = await ownerWithDog();
    const today = todayInParis();
    const weekly = (await (
      await client.post('/api/reminders', { ...REMINDER, recurrence: 'weekly', date: addDays(today, -15) })
    ).json()) as ReminderDto;
    const next = (await (await client.post(`/api/reminders/${weekly.id}/done`)).json()) as ReminderDto;
    expect(next.doneDate).toBeNull();
    expect(next.date > today).toBe(true);
    expect(next.date <= addDays(today, 7)).toBe(true);
  });

  it('refuse un soin d’un autre chien', async () => {
    const { client } = await ownerWithDog();
    expect((await client.post('/api/reminders', { ...REMINDER, healthEventId: 'inconnu' })).status).toBe(400);
  });
});

describe('calendrier', () => {
  it('exporte rappels et échéances de santé au format iCalendar', async () => {
    const { client } = await ownerWithDog();
    const today = todayInParis();
    await client.post('/api/reminders', { ...REMINDER, date: addDays(today, 3), time: '09:30', notes: 'Salon, rue des Lilas' });
    await client.post('/api/health-events', { kind: 'vaccin', date: addDays(today, -300), title: 'Rage', nextDueDate: addDays(today, 65) });
    const res = await client.get('/api/calendar.ics');
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const ics = await res.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(`DTSTART;TZID=Europe/Paris:${addDays(today, 3).replaceAll('-', '')}T093000`);
    expect(ics).toContain('DESCRIPTION:Salon\\, rue des Lilas');
    expect(ics).toContain('SUMMARY:Vaccin à refaire : Rage');
  });

  it('sert le lien d’abonnement sans session, sans les notes, et le révoque', async () => {
    const { client } = await ownerWithDog();
    await client.post('/api/reminders', { ...REMINDER, date: addDays(todayInParis(), 3), notes: 'Note privée' });
    expect(await (await client.get('/api/calendar-feed')).json()).toMatchObject({ active: false });

    const { url } = (await (await client.post('/api/calendar-feed')).json()) as { url: string };
    expect(url).toMatch(/^http:\/\/localhost:8787\/api\/calendar\/feed\/[A-Za-z0-9_-]{43}\.ics$/);
    const path = new URL(url).pathname;
    const feed = await new TestClient().get(path);
    expect(feed.status).toBe(200);
    const ics = await feed.text();
    expect(ics).toContain('SUMMARY:Toilettage');
    expect(ics).not.toContain('Note privée');
    expect(await (await client.get('/api/calendar-feed')).json()).toMatchObject({ active: true });

    // Un nouveau lien remplace l'ancien.
    const second = (await (await client.post('/api/calendar-feed')).json()) as { url: string };
    expect((await new TestClient().get(path)).status).toBe(404);
    expect((await new TestClient().get(new URL(second.url).pathname)).status).toBe(200);

    await client.delete('/api/calendar-feed');
    expect((await new TestClient().get(new URL(second.url).pathname)).status).toBe(404);
  });

  it('refuse un jeton mal formé ou inconnu', async () => {
    const anonymous = new TestClient();
    expect((await anonymous.get('/api/calendar/feed/abc.ics')).status).toBe(404);
    expect((await anonymous.get(`/api/calendar/feed/${'a'.repeat(43)}.ics`)).status).toBe(404);
  });
});

describe('format iCalendar', () => {
  it('échappe le texte et replie les lignes longues sans couper un caractère', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replaceAll('\r\n ', '')).toBe(`SUMMARY:${'é'.repeat(60)}`);
  });

  it('place l’alerte d’un rappel sans heure à 9 h la veille', () => {
    const ics = buildCalendar('EKO', [{ uid: 'u', title: 'T', date: '2026-11-10', time: null, alarmDaysBefore: 1 }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110');
    expect(ics).toContain('TRIGGER:-P0DT15H');
  });
});
