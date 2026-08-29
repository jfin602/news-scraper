import type { Database } from '../../database/database.ts';
import {
  createDigestLifecycleService,
  type DigestLifecycleService,
} from './lifecycle.ts';
import { createGeminiDigestProvider } from './provider.ts';

/**
 * Shared production composition for scheduled Worker passes and protected
 * administrative manual generation. Provider configuration remains lazy: a
 * missing key is represented by P3 as a bounded attempt result on demand.
 */
export function createProductionDigestLifecycleService(
  database: Database,
): DigestLifecycleService {
  return createDigestLifecycleService({
    database,
    provider: createGeminiDigestProvider(),
  });
}
