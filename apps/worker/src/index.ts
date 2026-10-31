import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDb } from './db/client';
import type { AppEnv, Env } from './env';
import { accountRoutes } from './routes/account';
import { authRoutes, purgeExpiredAuthData } from './routes/auth';
import { backupRoutes } from './routes/backup';
import { dogRoutes } from './routes/dog';
import { dailyRoutes } from './routes/daily';
import { fileRoutes, purgePendingFiles } from './routes/files';
import { notificationRoutes, sendDailyDigests } from './routes/notifications';
import { calendarFeedRoutes, reminderRoutes } from './routes/reminders';
import { healthRoutes } from './routes/health';
import { medalRoutes, publicMedalRoutes } from './routes/medal';
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
  // Public (jeton dans l'adresse) : monté avant les routes privées, dont le contrôle de session s'applique à tout ce qui suit.
  .route('/', calendarFeedRoutes)
  .route('/', backupRoutes)
  .route('/', accountRoutes)
  .route('/', dogRoutes)
  .route('/', healthRoutes)
  .route('/', dailyRoutes)
  .route('/', fileRoutes)
  .route('/', reminderRoutes)
  .route('/', notificationRoutes)
  .route('/', medalRoutes);

api.all('*', (c) => c.json({ error: 'not_found', message: 'Route inconnue.' }, 404));
api.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // Journal sans données personnelles : uniquement le type d'erreur et la route.
  console.error(JSON.stringify({ level: 'error', route: c.req.path, name: err.name, message: err.message }));
  return c.json({ error: 'internal', message: 'Une erreur inattendue est survenue.' }, 500);
});

app.route('/api', api);

// Fiche publique de la médaille (QR et NFC) : rendue par le Worker, sans session.
app.route('/', publicMedalRoutes);

// Tout le reste : l'application React (fichiers statiques, repli sur index.html).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    const db = getDb(env.DB);
    // 3 h UTC : ménage ; 6 h et 7 h UTC : récapitulatif de 8 h, heure de Paris (été comme hiver).
    ctx.waitUntil(Promise.all([purgeExpiredAuthData(db), purgePendingFiles(env, db), sendDailyDigests(env, db)]));
  },
} satisfies ExportedHandler<Env>;
