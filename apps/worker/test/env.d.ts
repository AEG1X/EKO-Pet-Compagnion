import type { D1Migration } from 'cloudflare:test';
import type { Env } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends import('../src/env').Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
export type { Env };
