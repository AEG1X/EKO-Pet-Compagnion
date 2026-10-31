import { type PublicMedal, telHref } from '@eko/shared';

/**
 * Rendu HTML de la fiche publique de la médaille, côté serveur : elle s'affiche sans JavaScript,
 * vite, sur n'importe quel téléphone. Feuille de style externe (/medal.css) pour respecter la CSP.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/** Texte saisi par le propriétaire : échappé, retours à la ligne conservés. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1F3D2B">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/medal.css">
</head>
<body>
<main class="medal">
${body}
<footer class="medal-footer">Fiche publique EKO · aucune donnée n’est collectée en consultant cette page.</footer>
</main>
</body>
</html>`;
}

const PHONE_ICON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';

export function renderMedalPage(medal: PublicMedal, photoUrl: string | null): string {
  const facts = [medal.breed, medal.sex, medal.age].filter(Boolean).map((f) => escapeHtml(f!));
  const parts: string[] = [];

  parts.push(`<header class="medal-hero">
${photoUrl ? `<img class="medal-photo" src="${escapeHtml(photoUrl)}" alt="Photo de ${escapeHtml(medal.name)}" width="168" height="168">` : '<div class="medal-photo medal-photo-empty" aria-hidden="true">🐾</div>'}
<p class="medal-kicker">Bonjour, je m’appelle</p>
<h1>${escapeHtml(medal.name)}</h1>
${facts.length ? `<p class="medal-facts">${facts.join(' · ')}</p>` : ''}
${medal.area ? `<p class="medal-area">J’habite à ${escapeHtml(medal.area)}</p>` : ''}
</header>`);

  if (medal.message) parts.push(`<p class="medal-message">${multiline(medal.message)}</p>`);

  if (medal.owner) {
    const who = medal.owner.name ? `Appeler ${escapeHtml(medal.owner.name)}` : 'Appeler mon humain';
    parts.push(`<section class="medal-card">
<h2>Tu m’as trouvé ?</h2>
<p>Merci ! Appelle-moi ce numéro, on viendra me chercher.</p>
<a class="medal-call" href="${escapeHtml(telHref(medal.owner.phone))}">${PHONE_ICON}<span>${who}</span></a>
<p class="medal-number">${escapeHtml(medal.owner.phone)}</p>
</section>`);
  } else {
    parts.push(`<section class="medal-card">
<h2>Tu m’as trouvé ?</h2>
<p>Merci ! Tu peux me déposer chez un vétérinaire : il saura retrouver ma famille.</p>
</section>`);
  }

  if (medal.emergencyInfo) {
    parts.push(`<section class="medal-card medal-urgent">
<h2>À savoir pour ma santé</h2>
<p>${multiline(medal.emergencyInfo)}</p>
</section>`);
  }

  if (medal.vet) {
    const vet = medal.vet;
    parts.push(`<section class="medal-card">
<h2>Mon vétérinaire</h2>
<p><strong>${escapeHtml(vet.organization ?? vet.name)}</strong>${vet.organization ? `<br>${escapeHtml(vet.name)}` : ''}</p>
${vet.address ? `<p class="medal-muted">${multiline(vet.address)}</p>` : ''}
${vet.phone ? `<a class="medal-secondary" href="${escapeHtml(telHref(vet.phone))}">${PHONE_ICON}<span>${escapeHtml(vet.phone)}</span></a>` : ''}
</section>`);
  }

  return layout(`${medal.name} · EKO`, parts.join('\n'));
}

/** Médaille inconnue ou désactivée : même réponse dans les deux cas, sans rien révéler. */
export function renderMedalNotFound(): string {
  return layout(
    'Médaille inactive · EKO',
    `<section class="medal-card medal-center">
<h1>Cette médaille n’est plus active</h1>
<p>Si tu as trouvé un chien, tu peux le déposer chez un vétérinaire ou en mairie : sa puce permettra de retrouver sa famille.</p>
</section>`,
  );
}
