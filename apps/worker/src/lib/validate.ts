import type { Context } from 'hono';
import type { z } from 'zod';
import { apiError } from './errors';

/** Lit et valide le corps JSON ; renvoie une erreur 400 lisible sinon. */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw apiError(400, 'invalid_json', 'Corps de requête JSON invalide.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Données invalides.';
    throw apiError(400, 'invalid_input', message);
  }
  return result.data;
}
