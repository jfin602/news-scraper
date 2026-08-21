import { createHash } from 'node:crypto';

import type { QueryExecutor } from '../../database/database.ts';

const DISTRIBUTION_PROFILE_SOURCE_VALIDITY_LOCK_NAMESPACE =
  'news-scraper:distribution-profile-source-validity-transaction-lock:v1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function distributionProfileSourceValidityLockKey(
  sourceId: string,
): string {
  if (!UUID_PATTERN.test(sourceId)) {
    throw new TypeError('Distribution Profile Source id must be a UUID.');
  }

  const digest = createHash('sha256')
    .update(DISTRIBUTION_PROFILE_SOURCE_VALIDITY_LOCK_NAMESPACE, 'utf8')
    .update('\0', 'utf8')
    .update(sourceId.toLowerCase(), 'utf8')
    .digest();
  return digest.readBigInt64BE(0).toString(10);
}

export async function acquireDistributionProfileSourceValidityLock(
  executor: QueryExecutor,
  sourceId: string,
): Promise<void> {
  await acquireTransactionLock(
    executor,
    distributionProfileSourceValidityLockKey(sourceId),
  );
}

export async function acquireDistributionProfileSourceValidityLocks(
  executor: QueryExecutor,
  sourceIds: readonly string[],
): Promise<void> {
  const orderedSourceIds = [
    ...new Set(sourceIds.map(normalizeSourceId)),
  ].sort();
  for (const sourceId of orderedSourceIds) {
    await acquireTransactionLock(
      executor,
      distributionProfileSourceValidityLockKey(sourceId),
    );
  }
}

function normalizeSourceId(sourceId: string): string {
  if (!UUID_PATTERN.test(sourceId)) {
    throw new TypeError('Distribution Profile Source id must be a UUID.');
  }
  return sourceId.toLowerCase();
}

async function acquireTransactionLock(
  executor: QueryExecutor,
  key: string,
): Promise<void> {
  await executor.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
}
