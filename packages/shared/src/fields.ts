import { z } from 'zod';
import { isoDateSchema } from './dog';

/** Champs facultatifs communs : une saisie vide devient null. */

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));
}

export const optionalDate = isoDateSchema
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((value) => value || null);

export const optionalId = z
  .string()
  .max(64)
  .nullable()
  .optional()
  .transform((value) => value || null);

export function optionalInt(min: number, max: number, message: string) {
  return z.number().int(message).min(min, message).max(max, message).nullable().optional().transform((v) => v ?? null);
}
