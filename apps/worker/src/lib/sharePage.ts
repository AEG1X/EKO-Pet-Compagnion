import { formatDuration, groupByMonth } from '@eko/shared';
import { escapeHtml } from './medalPage';

/**
 * Album partagé, rendu côté serveur sans JavaScript : la personne qui reçoit le lien n'a ni compte
 * ni application à installer. Feuille de style externe (/partage.css) pour respecter la CSP.
 */

export interface SharedItem {
  id: string;
  kind: 'photo' | 'video';
  takenDate: string;
  caption: string | null;
  durationSeconds: number | null;
  hasPreview: boolean;
  width: number | null;
  height: number | null;
}

export interface SharedAlbum {
  base: string;
  dogName: string;
  name: string;
  description: string | null;
  allowDownload: boolean;
  expiresAt: number | null;
  items: SharedItem[];
}

const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const expiryDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function layout(title: string, body: string, wide = true): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1F3D2B">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/partage.css">
</head>
<body>
<main class="share${wide ? '' : ' share-narrow'}">
${body}
<footer class="share-footer">Album privé partagé avec EKO · lien personnel, merci de ne pas le diffuser.</footer>
</main>
</body>
</html>`;
}

function tile(album: SharedAlbum, item: SharedItem): string {
  const label = `${item.kind === 'video' ? 'Vidéo' : 'Photo'} du ${longDate.format(new Date(`${item.takenDate}T00:00:00Z`))}`;
  const img = item.hasPreview
    ? `<img src="${album.base}/apercu/${item.id}" alt="" loading="lazy" decoding="async">`
    : `<span class="share-noimg" aria-hidden="true">${item.kind === 'video' ? '▶' : '🐾'}</span>`;
  const badge = item.kind === 'video' ? `<span class="share-badge">▶ ${item.durationSeconds !== null ? formatDuration(item.durationSeconds) : 'Vidéo'}</span>` : '';
  return `<li><a class="share-tile" href="${album.base}/${item.id}" aria-label="${escapeHtml(label)}">${img}${badge}</a></li>`;
}

export function renderSharedAlbum(album: SharedAlbum): string {
  const head = `<header class="share-head">
<p class="share-kicker">Les souvenirs de ${escapeHtml(album.dogName)}</p>
<h1>${escapeHtml(album.name)}</h1>
${album.description ? `<p class="share-desc">${escapeHtml(album.description)}</p>` : ''}
<p class="share-meta">${album.items.length} ${album.items.length > 1 ? 'souvenirs' : 'souvenir'}${
    album.expiresAt ? ` · lien valable jusqu’au ${escapeHtml(expiryDate.format(new Date(album.expiresAt)))}` : ''
  }</p>
</header>`;
  if (album.items.length === 0) {
    return layout(`${album.name} · EKO`, `${head}<p class="share-empty">Cet album est vide pour le moment.</p>`);
  }
  const groups = groupByMonth(album.items)
    .map(
      (g) => `<section class="share-month">
<h2>${escapeHtml(capitalize(monthTitle.format(new Date(`${g.month}-01T00:00:00Z`))))}</h2>
<ul class="share-grid">${g.items.map((i) => tile(album, i)).join('')}</ul>
</section>`,
    )
    .join('\n');
  return layout(`${album.name} · EKO`, `${head}\n${groups}`);
}

/** Un souvenir en grand, avec navigation vers le précédent et le suivant. */
export function renderSharedItem(album: SharedAlbum, index: number): string {
  const item = album.items[index]!;
  const prev = album.items[index - 1];
  const next = album.items[index + 1];
  const src = `${album.base}/fichier/${item.id}`;
  const date = longDate.format(new Date(`${item.takenDate}T00:00:00Z`));
  const ratio = item.width && item.height ? ` width="${item.width}" height="${item.height}"` : '';
  const media =
    item.kind === 'video'
      ? `<video class="share-media" src="${src}" controls playsinline preload="metadata"${item.hasPreview ? ` poster="${album.base}/apercu/${item.id}"` : ''}${ratio}></video>`
      : `<img class="share-media" src="${src}" alt="${escapeHtml(item.caption ?? `Photo du ${date}`)}"${ratio}>`;
  const nav = `<nav class="share-nav" aria-label="Navigation">
${prev ? `<a href="${album.base}/${prev.id}" rel="prev">‹ Précédent</a>` : '<span></span>'}
<a href="${album.base}">Tout l’album</a>
${next ? `<a href="${album.base}/${next.id}" rel="next">Suivant ›</a>` : '<span></span>'}
</nav>`;
  return layout(
    `${album.name} · EKO`,
    `<header class="share-head share-head-small"><p class="share-kicker"><a href="${album.base}">${escapeHtml(album.name)}</a> · ${index + 1} / ${album.items.length}</p></header>
<figure class="share-figure">
${media}
<figcaption>${item.caption ? `<strong>${escapeHtml(item.caption)}</strong><br>` : ''}<span>${escapeHtml(date)}</span></figcaption>
</figure>
${album.allowDownload ? `<p class="share-actions"><a class="share-button" href="${src}?telecharger=1">Télécharger l’original</a></p>` : ''}
${nav}`,
  );
}

/** Lien inconnu, expiré ou révoqué : même réponse, sans rien révéler de l'album. */
export function renderShareUnavailable(): string {
  return layout(
    'Lien indisponible · EKO',
    `<section class="share-card">
<h1>Ce lien n’est plus disponible</h1>
<p>Il a peut-être expiré ou été désactivé. Demande un nouveau lien à la personne qui te l’a envoyé.</p>
</section>`,
    false,
  );
}
