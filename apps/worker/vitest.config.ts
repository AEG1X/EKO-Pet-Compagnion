import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // Le binding ASSETS exige que le dossier du front existe, même vide.
  mkdirSync(path.join(__dirname, '../web/dist'), { recursive: true });
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            ENVIRONMENT: 'test',
            TEST_MIGRATIONS: migrations,
            SETUP_TOKEN: 'jeton-de-configuration-de-test',
            PIN_PEPPER: 'poivre-de-test',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
