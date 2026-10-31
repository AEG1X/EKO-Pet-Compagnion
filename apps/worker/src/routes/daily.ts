import {
  type Expense,
  type FeedingPlan,
  type Skill,
  type TrainingSession,
  expenseInputSchema,
  feedingPlanInputSchema,
  skillInputSchema,
  trainingSessionInputSchema,
} from '@eko/shared';
import { and, asc, desc, eq, isNull, lt, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { checkSameDog, dogCrud } from '../lib/crud';

/** Veille d'une date AAAA-MM-JJ. */
function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const feedingPlans = dogCrud({
  table: schema.feedingPlan,
  input: feedingPlanInputSchema,
  notFound: 'Alimentation introuvable.',
  orderBy: (t) => [desc(t.startDate), desc(t.createdAt)],
  toDto: (r): FeedingPlan => ({
    id: r.id,
    food: r.food,
    dailyGrams: r.dailyGrams,
    mealsPerDay: r.mealsPerDay,
    startDate: r.startDate,
    endDate: r.endDate,
    notes: r.notes,
  }),
  // Une nouvelle alimentation en cours clôt la précédente la veille de son début.
  beforeWrite: async (c, dogId, input, id) => {
    if (c.req.method !== 'POST' || input.endDate) return;
    const t = schema.feedingPlan;
    await c
      .get('db')
      .update(t)
      .set({ endDate: previousDay(input.startDate), updatedAt: Date.now() })
      .where(and(eq(t.dogId, dogId), isNull(t.endDate), lt(t.startDate, input.startDate), ne(t.id, id)));
  },
});

const skills = dogCrud({
  table: schema.trainingSkill,
  input: skillInputSchema,
  notFound: 'Apprentissage introuvable.',
  orderBy: (t) => [asc(t.status), asc(t.name)],
  toDto: (r): Skill => ({ id: r.id, name: r.name, status: r.status, acquiredDate: r.acquiredDate, notes: r.notes }),
  // La date d'acquisition n'a de sens que pour un apprentissage acquis.
  beforeWrite: async (_c, _dogId, input) => (input.status === 'acquis' ? undefined : { acquiredDate: null }),
});

const trainingSessions = dogCrud({
  table: schema.trainingSession,
  input: trainingSessionInputSchema,
  notFound: 'Séance introuvable.',
  orderBy: (t) => [desc(t.date), desc(t.createdAt)],
  toDto: (r): TrainingSession => ({
    id: r.id,
    date: r.date,
    durationMinutes: r.durationMinutes,
    skillId: r.skillId,
    notes: r.notes,
  }),
  beforeWrite: (c, dogId, input) =>
    checkSameDog(c.get('db'), schema.trainingSkill, dogId, input.skillId, 'Apprentissage introuvable.'),
});

const expenses = dogCrud({
  table: schema.expense,
  input: expenseInputSchema,
  notFound: 'Dépense introuvable.',
  orderBy: (t) => [desc(t.date), desc(t.createdAt)],
  toDto: (r): Expense => ({
    id: r.id,
    date: r.date,
    amountCents: r.amountCents,
    category: r.category,
    label: r.label,
    healthEventId: r.healthEventId,
    notes: r.notes,
  }),
  beforeWrite: (c, dogId, input) =>
    checkSameDog(c.get('db'), schema.healthEvent, dogId, input.healthEventId, 'Soin introuvable.'),
});

export const dailyRoutes = new Hono<AppEnv>()
  .route('/feeding-plans', feedingPlans)
  .route('/skills', skills)
  .route('/training-sessions', trainingSessions)
  .route('/expenses', expenses);
