import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF en complément du cookie SameSite=Strict : toute requête d'écriture
 * doit venir de l'origine exacte de l'application et envoyer du JSON (un formulaire
 * HTML d'un autre site ne peut produire ni l'un ni l'autre).
 * Seule exception : l'envoi d'un fichier brut (PUT /api/files), qu'aucun formulaire HTML
 * ne peut émettre et qu'un autre site ne peut pas envoyer sans pré-vérification CORS (refusée).
 */
export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (origin !== c.env.ORIGIN) {
    throw apiError(403, 'bad_origin', 'Requête refusée : origine inattendue.');
  }
  const contentType = c.req.header('content-type') ?? '';
  const hasBody = c.req.header('content-length') !== '0' && c.req.raw.body !== null;
  const isFileUpload = c.req.method === 'PUT' && c.req.path === '/api/files';
  if (hasBody && !isFileUpload && !contentType.toLowerCase().startsWith('application/json')) {
    throw apiError(415, 'unsupported_media_type', 'Le corps de la requête doit être en JSON.');
  }
  return next();
};
