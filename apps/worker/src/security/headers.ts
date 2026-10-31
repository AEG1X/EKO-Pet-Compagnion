import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';

/**
 * Politique de sécurité du contenu stricte : aucun script inline ni ressource externe.
 * Les polices sont auto-hébergées, les images viennent du Worker (ou d'un blob local).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  // Les réponses d'assets ont des en-têtes immuables : on recrée la réponse pour pouvoir les compléter.
  try {
    c.res.headers.set('x-eko', '1');
    c.res.headers.delete('x-eko');
  } catch {
    c.res = new Response(c.res.body, c.res);
  }
  const h = c.res.headers;
  // Un fichier servi (document, photo) porte déjà sa propre politique, plus stricte.
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  // Fiche publique : « same-origin » pour que le navigateur envoie l'origine du formulaire de signalement
  // (avec « no-referrer », elle vaut « null ») ; rien ne part vers d'autres sites dans les deux cas.
  h.set('Referrer-Policy', c.req.path.startsWith('/m/') ? 'same-origin' : 'no-referrer');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  // La géolocalisation n'est permise que sur la fiche publique (signalement, avec l'accord du visiteur).
  const geolocation = c.req.path.startsWith('/m/') ? 'geolocation=(self)' : 'geolocation=()';
  h.set('Permissions-Policy', `camera=(), microphone=(), ${geolocation}, payment=(), usb=()`);
  // Aucune page d'EKO ne doit être indexée, y compris la future fiche publique.
  h.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (c.env.ENVIRONMENT === 'staging' || c.env.ENVIRONMENT === 'production') {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};
