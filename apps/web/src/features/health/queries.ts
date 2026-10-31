import type { HealthEvent, HealthEventInput, Treatment, TreatmentInput, WeightEntry, WeightInput } from '@eko/shared';
import { resource } from '../../lib/resource';

const events = resource<HealthEvent, HealthEventInput>('/health-events');
const treatments = resource<Treatment, TreatmentInput>('/treatments');
const weights = resource<WeightEntry, WeightInput>('/weights');

export const useHealthEvents = events.useList;
export const useSaveEvent = events.useSave;
export const useRemoveEvent = events.useRemove;
export const useTreatments = treatments.useList;
export const useSaveTreatment = treatments.useSave;
export const useRemoveTreatment = treatments.useRemove;
export const useWeights = weights.useList;
export const useSaveWeight = weights.useSave;
export const useRemoveWeight = weights.useRemove;
