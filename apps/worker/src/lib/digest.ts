import { HEALTH_EVENT_LABELS, type HealthEvent, type Reminder, addDays, daysBetween, occurrences, upcomingDue } from '@eko/shared';

export interface DigestItem {
  date: string;
  time: string | null;
  title: string;
}

/** Délais de prévenance des échéances de santé : une semaine avant, puis le jour même. */
const HEALTH_NOTICE_DAYS = [7, 0];

/**
 * Ce qu'il faut annoncer aujourd'hui : chaque occurrence de rappel dont le jour de prévenance
 * tombe aujourd'hui, et les échéances de santé à J-7 et le jour J.
 */
export function dueToday(reminders: Reminder[], events: HealthEvent[], today: string): DigestItem[] {
  const items: DigestItem[] = [];
  for (const r of reminders) {
    if (r.doneDate) continue;
    for (const date of occurrences(r, today, addDays(today, r.notifyDaysBefore))) {
      if (addDays(date, -r.notifyDaysBefore) === today) items.push({ date, time: r.time, title: r.title });
    }
  }
  for (const e of upcomingDue(events, today)) {
    if (HEALTH_NOTICE_DAYS.includes(daysBetween(today, e.nextDueDate!))) {
      items.push({ date: e.nextDueDate!, time: null, title: `${HEALTH_EVENT_LABELS[e.kind]} à refaire : ${e.title}` });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function when(item: DigestItem, today: string): string {
  const days = daysBetween(today, item.date);
  const day = days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `Le ${longDay.format(new Date(`${item.date}T00:00:00Z`))}`;
  return item.time ? `${day} à ${item.time.replace(':', ' h ')}` : day;
}

/** Texte de la notification : une ligne par élément. */
export function digestMessage(items: DigestItem[], today: string, dogName: string) {
  const lines = items.map((i) => `${when(i, today)} · ${i.title}`);
  return {
    title: items.length === 1 ? `${dogName} · ${items[0]!.title}` : `${dogName} · ${items.length} rappels`,
    body: lines.join('\n'),
    url: '/calendrier',
    tag: `eko-rappels-${today}`,
  };
}
