/**
 * Génération d'un calendrier iCalendar (RFC 5545) : export ponctuel et lien d'abonnement.
 * Événements « journée entière » sans heure, sinon heure locale Europe/Paris.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  /** AAAA-MM-JJ */
  date: string;
  /** HH:MM, ou null pour toute la journée. */
  time: string | null;
  description?: string | null;
  /** Alerte N jours avant (null : aucune). */
  alarmDaysBefore?: number | null;
}

/** Fuseau Europe/Paris (règles européennes en vigueur depuis 1996). */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Échappe une valeur texte : antislash, point-virgule, virgule et retours à la ligne. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Replie une ligne à 75 octets, sans couper un caractère UTF-8. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    // La première ligne fait 75 octets, les suivantes 74 + l'espace de continuation.
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (date: string) => date.replaceAll('-', '');

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EKO//Pet Companion//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/Paris',
    // Les applications rafraîchissent un abonnement environ toutes les 6 heures.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...VTIMEZONE,
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${escapeText(e.title)}`);
    if (e.time) {
      const start = `${compactDate(e.date)}T${e.time.replace(':', '')}00`;
      lines.push(`DTSTART;TZID=Europe/Paris:${start}`, 'DURATION:PT1H');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, 'DURATION:P1D', 'TRANSP:TRANSPARENT');
    }
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.alarmDaysBefore != null) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(e.title)}`,
        // Sans heure, l'alerte tombe à 9 h le jour voulu ; avec heure, N jours (ou 1 h) avant.
        e.time
          ? `TRIGGER:${e.alarmDaysBefore === 0 ? '-PT1H' : `-P${e.alarmDaysBefore}D`}`
          : `TRIGGER:${e.alarmDaysBefore === 0 ? 'PT9H' : `-P${e.alarmDaysBefore - 1}DT15H`}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
