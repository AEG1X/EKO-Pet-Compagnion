const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });

/** Date du jour au format AAAA-MM-JJ, dans le fuseau de l'appareil. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Les dates AAAA-MM-JJ sont calendaires : on les lit à midi local pour éviter tout décalage de fuseau. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function formatDate(value: string): string {
  return longDate.format(parseIsoDate(value));
}

export function formatShortDate(value: string): string {
  return shortDate.format(parseIsoDate(value));
}

/** « sept. 2024 » : pour les axes qui couvrent plusieurs années. */
export function formatMonthYear(value: string): string {
  return monthYear.format(parseIsoDate(value));
}

/** Nombre de jours entre aujourd'hui et la date (négatif si passée). */
export function daysUntil(value: string, today = todayIso()): number {
  return Math.round((parseIsoDate(value).getTime() - parseIsoDate(today).getTime()) / 86_400_000);
}

/** « aujourd'hui », « demain », « dans 12 jours », « en retard de 3 jours ». */
export function relativeDays(value: string, today = todayIso()): string {
  const days = daysUntil(value, today);
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  if (days > 1) return `dans ${days} jours`;
  return days === -1 ? 'en retard d’un jour' : `en retard de ${-days} jours`;
}
