import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACCENTS } from '@eko/shared';
import { describe, expect, it } from 'vitest';

describe('theme-init.js', () => {
  it('reprend exactement les couleurs d’accent partagées', () => {
    const source = readFileSync(path.join(__dirname, '../../public/theme-init.js'), 'utf8');
    for (const [id, { light, dark }] of Object.entries(ACCENTS)) {
      expect(source).toContain(`${id}: ['${light}', '${dark}']`);
    }
  });
});
