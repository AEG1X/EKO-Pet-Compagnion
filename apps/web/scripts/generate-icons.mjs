// Génère les icônes PNG de la PWA à partir du motif SVG (nécessite Playwright + Chromium).
// Usage : pnpm --filter @eko/web icons
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const paw = (scale) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -34)" fill="#F7F4EC">
    <circle cx="17" cy="29" r="5.5"/><circle cx="26.5" cy="18" r="5.5"/>
    <circle cx="37.5" cy="18" r="5.5"/><circle cx="47" cy="29" r="5.5"/>
    <path d="M32 31c-7.5 0-13.5 8.8-13.5 15.3 0 4 2.7 6.4 6.4 6.4 3 0 4.8-1.5 7.1-1.5s4.1 1.5 7.1 1.5c3.7 0 6.4-2.4 6.4-6.4C45.5 39.8 39.5 31 32 31z"/>
  </g>`;

const icons = [
  { file: 'icons/icon-192.png', size: 192, radius: 14, scale: 1 },
  { file: 'icons/icon-512.png', size: 512, radius: 14, scale: 1 },
  // Zone de sécurité « maskable » : le motif tient dans le cercle central de 80 %.
  { file: 'icons/icon-maskable-512.png', size: 512, radius: 0, scale: 0.72 },
  // iOS applique ses propres coins arrondis : fond plein.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.9 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${icon.size}" height="${icon.size}">
    <rect width="64" height="64" rx="${icon.radius}" fill="#1F3D2B"/>${paw(icon.scale)}</svg>`;
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(publicDir, icon.file), omitBackground: true });
  console.log(`✓ ${icon.file}`);
}
await browser.close();
