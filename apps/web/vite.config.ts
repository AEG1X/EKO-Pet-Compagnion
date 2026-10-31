import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Script d'enregistrement en fichier séparé : compatible avec la CSP sans script inline.
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'theme-init.js', 'push-sw.js'],
      manifest: {
        name: 'EKO — Pet Companion',
        short_name: 'EKO',
        description: 'Toute la vie d’Eko, au même endroit.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F7F4EC',
        theme_color: '#1F3D2B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Seule la coquille de l'application est mise en cache : jamais les réponses de l'API ni les médias.
        globPatterns: ['**/*.{js,css,html,svg,png}', 'assets/manrope-latin-*.woff2'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/m\//, /^\/cal\//, /^\/s\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        // Réception des notifications Web Push et ouverture de la page au toucher.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  server: {
    // Développement : l'API tourne avec `wrangler dev` sur le port 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
  // Aucun fichier intégré en data: URI : la CSP n'autorise que les ressources du même domaine.
  build: { sourcemap: false, target: 'es2022', assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
  },
});
