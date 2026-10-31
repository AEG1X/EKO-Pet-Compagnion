import type {
  Expense,
  ExpenseInput,
  FeedingPlan,
  FeedingPlanInput,
  Skill,
  SkillInput,
  TrainingSession,
  TrainingSessionInput,
} from '@eko/shared';
import { resource } from '../../lib/resource';

export const feedingPlans = resource<FeedingPlan, FeedingPlanInput>('/feeding-plans');
// Supprimer un apprentissage détache ses séances : on rafraîchit aussi leur liste.
export const skills = resource<Skill, SkillInput>('/skills', [['/training-sessions']]);
export const trainingSessions = resource<TrainingSession, TrainingSessionInput>('/training-sessions');
export const expenses = resource<Expense, ExpenseInput>('/expenses');
