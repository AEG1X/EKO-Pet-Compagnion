import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';

/** Page HTML rendue par le Worker (fiche publique, album partagé), jamais mise en cache. */
export function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Toujours relue : une désactivation ou une révocation doit prendre effet immédiatement.
      'cache-control': 'no-store',
    },
  });
}

/** Tâche de fond (statistiques, alertes) qui ne doit ni retarder ni faire échouer la réponse. */
export function runInBackground(c: Context<AppEnv>, task: Promise<unknown>) {
  const safe = task.catch(() => undefined);
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // Pas de contexte d'exécution (tests) : la tâche se termine d'elle-même.
  }
}

/** En-tête Content-Disposition avec un nom compatible ASCII et sa version UTF-8. */
export function disposition(kind: 'inline' | 'attachment', name: string | null): string {
  if (!name) return kind;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Politique de sécurité propre aux fichiers servis : aucun script, aucun cadre. */
export const FILE_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'none'";

/**
 * Sert un fichier de R2, avec lecture partielle (Range) : indispensable pour lire une vidéo dans Safari.
 * Renvoie null si l'objet n'existe plus.
 */
export async function serveStoredFile(
  env: Env,
  request: Request,
  file: { r2Key: string; contentType: string; size: number; name: string | null },
  options: { download: boolean; cache: string },
): Promise<Response | null> {
  const wantsRange = /^bytes=\d*-\d*$/.test(request.headers.get('range') ?? '');
  const object = await env.FILES.get(file.r2Key, wantsRange ? { range: request.headers } : undefined);
  if (!object) return null;
  const headers: Record<string, string> = {
    'content-type': file.contentType,
    'content-length': String(file.size),
    'accept-ranges': 'bytes',
    'content-disposition': disposition(options.download ? 'attachment' : 'inline', file.name),
    'cache-control': options.cache,
    'content-security-policy': FILE_CSP,
  };
  const range = object.range as { offset?: number; length?: number } | undefined;
  if (wantsRange && range && range.offset !== undefined) {
    const length = range.length ?? file.size - range.offset;
    headers['content-length'] = String(length);
    headers['content-range'] = `bytes ${range.offset}-${range.offset + length - 1}/${file.size}`;
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}
