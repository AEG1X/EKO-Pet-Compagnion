import { ACCENTS, type AccentId, type Theme } from '@eko/shared';

const THEME_KEY = 'eko-theme';
const ACCENT_KEY = 'eko-accent';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Navigation privée : le thème s'applique quand même pour cette visite.
  }
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return media().matches ? 'dark' : 'light';
  return theme;
}

/** Applique le thème et la couleur d'accent, et les mémorise pour le prochain démarrage. */
export function applyAppearance(theme: Theme, accent: AccentId) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme);
  const pair = ACCENTS[accent] ?? ACCENTS.foret;
  root.style.setProperty('--accent-light', pair.light);
  root.style.setProperty('--accent-dark', pair.dark);
  store(THEME_KEY, theme);
  store(ACCENT_KEY, accent);
}

/** Suit les changements clair/sombre du système quand le thème est « automatique ». */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const query = media();
  const listener = () => {
    if (getTheme() === 'system') document.documentElement.dataset.theme = resolveTheme('system');
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
