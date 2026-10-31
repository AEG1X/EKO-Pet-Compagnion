import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDb } from './db/client';
import type { AppEnv, Env } from './env';
import { accountRoutes } from './routes/account';
import { authRoutes, purgeExpiredAuthData } from './routes/auth';
import { dogRoutes } from './routes/dog';
import { csrfProtection } from './security/csrf';
import { securityHeaders } from './security/headers';

export const app = new Hono<AppEnv>();

app.use('*', securityHeaders);

const api = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    c.set('db', getDb(c.env.DB));
    c.header('Cache-Control', 'no-store');
    await next();
  })
  .use('*', csrfProtection)
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', authRoutes)
  .route('/', accountRoutes)
  .route('/', dogRoutes);

api.all('*', (c) => c.json({ error: 'not_found', message: 'Route inconnue.' }, 404));
api.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // Journal sans données personnelles : uniquement le type d'erreur et la route.
  console.error(JSON.stringify({ level: 'error', route: c.req.path, name: err.name, message: err.message }));
  return c.json({ error: 'internal', message: 'Une erreur inattendue est survenue.' }, 500);
});

app.route('/api', api);

// Tout le reste : l'application React (fichiers statiques, repli sur index.html).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeExpiredAuthData(getDb(env.DB)));
  },
} satisfies ExportedHandler<Env>;
