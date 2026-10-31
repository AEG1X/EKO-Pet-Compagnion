import { type HealthEvent, upcomingDue as sharedUpcomingDue } from '@eko/shared';
import { todayIso } from '../../lib/dates';

/** Échéances de santé à venir, par rapport à la date du jour de l'appareil (voir @eko/shared). */
export function upcomingDue(events: HealthEvent[], today = todayIso()): HealthEvent[] {
  return sharedUpcomingDue(events, today);
}
