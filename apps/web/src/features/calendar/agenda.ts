import { HEALTH_EVENT_LABELS, type HealthEvent, type Reminder, occurrences, upcomingDue } from '@eko/shared';

export type AgendaType = 'rappel' | 'echeance' | 'soin';

export interface AgendaItem {
  key: string;
  date: string;
  time: string | null;
  title: string;
  type: AgendaType;
  /** Rappel d'origine, pour le cocher ou le modifier. */
  reminder?: Reminder;
  /** Rappel non fait dont la date est passée. */
  overdue?: boolean;
}

function byDateTime(a: AgendaItem, b: AgendaItem) {
  return a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);
}

/**
 * Tout ce qui tombe entre `from` et `to` : occurrences des rappels non faits, échéances de santé
 * et soins effectués. Les rappels en retard (date passée, pas encore faits) sont ajoutés avant.
 */
export function agendaItems(
  reminders: Reminder[],
  events: HealthEvent[],
  from: string,
  to: string,
  today: string,
  options: { includeOverdue?: boolean; includePastCare?: boolean; nextOnly?: boolean } = {},
): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const r of reminders) {
    if (r.doneDate) continue;
    if (options.includeOverdue && r.date < today) {
      items.push({ key: `r-${r.id}-retard`, date: r.date, time: r.time, title: r.title, type: 'rappel', reminder: r, overdue: true });
    }
    // Un rappel en retard n'apparaît qu'une fois : ses occurrences suivantes commencent après aujourd'hui.
    const start = r.date < today && options.includeOverdue ? (today > from ? today : from) : from;
    // nextOnly : un rappel récurrent ne montre que sa prochaine occurrence (liste « à venir » lisible).
    const dates = occurrences(r, start, to, options.nextOnly && r.date >= today ? 1 : options.nextOnly ? 0 : undefined);
    for (const date of dates) {
      if (options.includeOverdue && date === r.date && r.date < today) continue;
      items.push({ key: `r-${r.id}-${date}`, date, time: r.time, title: r.title, type: 'rappel', reminder: r, overdue: date < today });
    }
  }
  for (const e of upcomingDue(events, today)) {
    const due = e.nextDueDate!;
    // Une échéance dépassée (60 jours au plus, voir upcomingDue) reste visible comme retard.
    const late = Boolean(options.includeOverdue) && due < today && due < from;
    if ((due >= from && due <= to) || late) {
      items.push({
        key: `e-${e.id}`,
        date: due,
        time: null,
        title: `${HEALTH_EVENT_LABELS[e.kind]} à refaire : ${e.title}`,
        type: 'echeance',
        overdue: due < today,
      });
    }
  }
  if (options.includePastCare) {
    for (const e of events) {
      if (e.date >= from && e.date <= to) {
        items.push({ key: `s-${e.id}`, date: e.date, time: null, title: `${HEALTH_EVENT_LABELS[e.kind]} : ${e.title}`, type: 'soin' });
      }
    }
  }
  return items.sort(byDateTime);
}

/** Jours affichés dans la grille d'un mois, du lundi de la première semaine au dimanche de la dernière. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const start = Date.UTC(year, month, 1 - offset);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}
