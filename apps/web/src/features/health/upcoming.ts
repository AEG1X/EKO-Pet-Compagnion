import type { HealthEvent } from '@eko/shared';
import { daysUntil, todayIso } from '../../lib/dates';

/**
 * Échéances à suivre : pour chaque soin (même type, même intitulé), seule la plus récente compte,
 * car un rappel déjà refait n'est plus « à venir ». Les retards de plus de 60 jours sont ignorés.
 */
export function upcomingDue(events: HealthEvent[], today = todayIso()): HealthEvent[] {
  const latest = new Map<string, HealthEvent>();
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  for (const e of sorted) {
    const key = `${e.kind}:${e.title.trim().toLowerCase()}`;
    if (!latest.has(key)) latest.set(key, e);
  }
  return [...latest.values()]
    .filter((e) => e.nextDueDate && daysUntil(e.nextDueDate, today) >= -60)
    .sort((a, b) => a.nextDueDate!.localeCompare(b.nextDueDate!));
}
