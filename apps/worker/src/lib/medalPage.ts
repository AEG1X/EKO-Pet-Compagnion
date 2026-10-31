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

function layout(title: string, body: string, script = false): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="same-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1F3D2B">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/medal.css">
${script ? '<script src="/medal.js" defer></script>\n' : ''}</head>
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

function callCard(medal: PublicMedal, lost: boolean): string {
  if (!medal.owner) {
    return `<section class="medal-card">
<h2>Tu m’as trouvé ?</h2>
<p>Merci ! Tu peux me déposer chez un vétérinaire : il saura retrouver ma famille.</p>
</section>`;
  }
  const who = medal.owner.name ? `Appeler ${escapeHtml(medal.owner.name)}` : 'Appeler mon humain';
  return `<section class="medal-card">
<h2>${lost ? 'Tu m’as trouvé ? Appelle vite !' : 'Tu m’as trouvé ?'}</h2>
<p>Merci ! Appelle ce numéro, on viendra me chercher.</p>
<a class="medal-call" href="${escapeHtml(telHref(medal.owner.phone))}">${PHONE_ICON}<span>${who}</span></a>
<p class="medal-number">${escapeHtml(medal.owner.phone)}</p>
</section>`;
}

function reportForm(name: string, action: string): string {
  return `<section class="medal-card" id="signaler">
<h2>Tu m’as vu ?</h2>
<p>Préviens ma famille : ton message lui arrive tout de suite.</p>
<form class="medal-form" method="post" action="${escapeHtml(action)}">
<label for="r-message">Où et quand m’as-tu vu ?</label>
<textarea id="r-message" name="message" maxlength="500" rows="3" placeholder="Près de la boulangerie de la place, il y a 10 minutes…"></textarea>
<label for="r-contact">Ton numéro ou ton e-mail (facultatif)</label>
<input id="r-contact" name="contact" maxlength="100" autocomplete="tel">
<input type="hidden" name="latitude" id="r-lat">
<input type="hidden" name="longitude" id="r-lon">
<input type="hidden" name="accuracy" id="r-acc">
<div class="medal-geo" data-geo hidden>
<button type="button" class="medal-secondary" id="r-geo">📍 Joindre ma position</button>
<p class="medal-muted" id="r-geo-status" aria-live="polite"></p>
</div>
<p class="medal-muted medal-small">Ta position n’est envoyée que si tu appuies sur ce bouton et l’acceptes. Les signalements sont effacés 30 jours après que ${escapeHtml(name)} est retrouvé.</p>
<input class="medal-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="medal-call" type="submit">Envoyer à sa famille</button>
</form>
</section>`;
}

/** Photos de l'album choisi (aperçus), en grille. */
function gallery(medal: PublicMedal, galleryBase: string | null, title: string): string {
  if (!galleryBase || medal.gallery.length === 0) return '';
  const items = medal.gallery
    .map((id) => `<li><img src="${escapeHtml(galleryBase + id)}" alt="" loading="lazy" decoding="async"></li>`)
    .join('');
  return `<section class="medal-gallery" aria-label="${escapeHtml(title)}">
<h2>${escapeHtml(title)}</h2>
<ul>${items}</ul>
</section>`;
}

/** Hors mode perdu : un moyen de joindre la famille reste présent, sans s'imposer. */
function discreetContact(medal: PublicMedal): string {
  const action = medal.owner
    ? `<a class="medal-secondary" href="${escapeHtml(telHref(medal.owner.phone))}">${PHONE_ICON}<span>${
        medal.owner.name ? `Appeler ${escapeHtml(medal.owner.name)}` : 'Appeler ma famille'
      }</span></a>`
    : `<p class="medal-muted">${medal.vet ? 'Tu peux me déposer chez mon vétérinaire, indiqué ci-dessus.' : 'Tu peux me déposer chez un vétérinaire : ma puce permettra de retrouver ma famille.'}</p>`;
  return `<section class="medal-discreet">
<p><strong>Je me promène tout seul ?</strong> Merci de veiller sur moi.</p>
${action}
</section>`;
}

export function renderMedalPage(medal: PublicMedal, photoUrl: string | null, reportAction: string | null = null, galleryBase: string | null = null): string {
  const facts = [medal.breed, medal.sex, medal.age].filter(Boolean).map((f) => escapeHtml(f!));
  const parts: string[] = [];
  const lost = Boolean(medal.lost);

  parts.push(`<header class="medal-hero${lost ? ' medal-hero-lost' : ''}">
${lost ? '<p class="medal-alert" role="alert">Je suis perdu ! Ma famille me cherche.</p>' : ''}
${photoUrl ? `<img class="medal-photo" src="${escapeHtml(photoUrl)}" alt="Photo de ${escapeHtml(medal.name)}" width="168" height="168">` : '<div class="medal-photo medal-photo-empty" aria-hidden="true">🐾</div>'}
<p class="medal-kicker">Bonjour, je m’appelle</p>
<h1>${escapeHtml(medal.name)}</h1>
${facts.length ? `<p class="medal-facts">${facts.join(' · ')}</p>` : ''}
${medal.area ? `<p class="medal-area">J’habite à ${escapeHtml(medal.area)}</p>` : ''}
</header>`);

  if (medal.lost?.message) parts.push(`<p class="medal-message medal-message-lost">${multiline(medal.lost.message)}</p>`);
  if (medal.message) parts.push(`<p class="medal-message">${multiline(medal.message)}</p>`);

  if (lost) {
    // Mode perdu : appeler et signaler d'abord, les photos aident ensuite à le reconnaître.
    parts.push(callCard(medal, true));
    if (reportAction) parts.push(reportForm(medal.name, reportAction));
    parts.push(gallery(medal, galleryBase, 'Pour me reconnaître'));
  } else {
    parts.push(gallery(medal, galleryBase, 'Mes souvenirs'));
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

  if (!lost) parts.push(discreetContact(medal));

  return layout(lost ? `${medal.name} est perdu · EKO` : `${medal.name} · EKO`, parts.filter(Boolean).join('\n'), lost && Boolean(reportAction));
}

/** Après un signalement : remerciement, et rappel du numéro à appeler. */
export function renderReportResult(medal: PublicMedal, backUrl: string, outcome: 'ok' | 'invalid' | 'limited' | 'closed', detail?: string): string {
  const texts = {
    ok: ['Merci !', `La famille de ${medal.name} vient d’être prévenue.`],
    invalid: ['Signalement incomplet', detail ?? 'Écris un message ou partage ta position.'],
    limited: ['Trop de signalements', 'Merci ! Plusieurs messages sont déjà partis. Pour aller plus vite, appelle directement.'],
    closed: ['Bonne nouvelle', `${medal.name} n’est plus signalé comme perdu.`],
  } as const;
  const [title, text] = texts[outcome];
  return layout(
    `${title} · EKO`,
    `<section class="medal-card medal-center">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(text)}</p>
</section>
${outcome === 'closed' ? '' : callCard(medal, true)}
<p class="medal-center-link"><a href="${escapeHtml(backUrl)}">Retour à la fiche</a></p>`,
  );
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
