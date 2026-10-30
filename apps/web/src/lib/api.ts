import type { ApiError as ApiErrorBody } from '@eko/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = (error: ApiError) => void;
const authListeners = new Set<Listener>();

/** Prévient l'application quand une réponse indique une session expirée (401) ou verrouillée (423). */
export function onAuthError(listener: Listener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ton réseau puis réessaie.');
  }
  if (!res.ok) {
    let data: Partial<ApiErrorBody> = {};
    try {
      data = (await res.json()) as Partial<ApiErrorBody>;
    } catch {
      // Réponse non JSON (panne, proxy) : message générique ci-dessous.
    }
    const retryAfter = Number(res.headers.get('retry-after')) || undefined;
    const error = new ApiError(
      res.status,
      data.error ?? 'http_error',
      data.message ?? 'Une erreur est survenue. Réessaie dans un instant.',
      retryAfter,
    );
    // /me sert justement à connaître l'état de la session : inutile de prévenir pour lui-même.
    if (path !== '/me' && (res.status === 401 || (res.status === 423 && error.code === 'locked'))) {
      authListeners.forEach((listener) => listener(error));
    }
    throw error;
  }
  return (await res.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'Opération annulée ou expirée. Réessaie quand tu es prêt.';
  }
  if (error instanceof Error && error.name === 'InvalidStateError') {
    return 'Cet appareil est déjà enregistré.';
  }
  return 'Une erreur inattendue est survenue.';
}
