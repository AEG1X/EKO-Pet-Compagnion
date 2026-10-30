import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Erreur métier renvoyée au client sous la forme { error, message }. */
export function apiError(
  status: ContentfulStatusCode,
  error: string,
  message: string,
  headers: Record<string, string> = {},
): HTTPException {
  return new HTTPException(status, {
    res: new Response(JSON.stringify({ error, message }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    }),
  });
}
