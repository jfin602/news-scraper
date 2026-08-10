import { createHash } from 'node:crypto';

import type { QueryExecutor } from '../database/database.ts';

const ARTICLE_IDENTITY_LOCK_NAMESPACE =
  'news-scraper:article-identity-transaction-lock:v1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type ArticleIdentityKind = 'external_id' | 'canonical_url';

export interface ArticleIdentityLockInput {
  readonly sourceId: string;
  readonly externalId?: string;
  readonly canonicalIdentityUrl: string;
}

export function articleIdentityLockKey(
  sourceId: string,
  kind: ArticleIdentityKind,
  completeIdentityValue: string,
): string {
  if (!UUID_PATTERN.test(sourceId)) {
    throw new TypeError('Article identity Source id must be a UUID.');
  }
  if (kind !== 'external_id' && kind !== 'canonical_url') {
    throw new TypeError('Article identity kind is invalid.');
  }
  if (
    typeof completeIdentityValue !== 'string' ||
    completeIdentityValue.length === 0
  ) {
    throw new TypeError('Article identity value must be non-empty.');
  }

  const digest = createHash('sha256')
    .update(ARTICLE_IDENTITY_LOCK_NAMESPACE, 'utf8')
    .update('\0', 'utf8')
    .update(sourceId.toLowerCase(), 'utf8')
    .update('\0', 'utf8')
    .update(kind, 'utf8')
    .update('\0', 'utf8')
    .update(completeIdentityValue, 'utf8')
    .digest();
  return digest.readBigInt64BE(0).toString(10);
}

export async function acquireArticleIdentityLocks(
  executor: QueryExecutor,
  input: ArticleIdentityLockInput,
): Promise<void> {
  if (input.externalId !== undefined) {
    await acquireTransactionLock(
      executor,
      articleIdentityLockKey(input.sourceId, 'external_id', input.externalId),
    );
  }
  await acquireTransactionLock(
    executor,
    articleIdentityLockKey(
      input.sourceId,
      'canonical_url',
      input.canonicalIdentityUrl,
    ),
  );
}

async function acquireTransactionLock(
  executor: QueryExecutor,
  key: string,
): Promise<void> {
  await executor.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
}
