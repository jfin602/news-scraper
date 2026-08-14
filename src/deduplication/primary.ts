import type { PersistedArticle } from '../articles/repository.ts';

export interface SourcePriorityContext {
  readonly priorities: ReadonlyMap<string, number>;
}

/** Returns a negative value when left is the preferred Primary. */
export function comparePrimaryCandidates(
  left: PersistedArticle,
  right: PersistedArticle,
  context: SourcePriorityContext,
): number {
  const sourcePriority = compareDescending(
    requiredPriority(context, left.sourceId),
    requiredPriority(context, right.sourceId),
  );
  if (sourcePriority !== 0) return sourcePriority;

  const completeness = metadataCompleteness(right) - metadataCompleteness(left);
  if (completeness !== 0) return completeness;

  const destination = httpsQuality(right) - httpsQuality(left);
  if (destination !== 0) return destination;

  const publication = comparePublicationTime(left, right);
  if (publication !== 0) return publication;

  const firstSeen = compareDate(left.firstSeenAt, right.firstSeenAt);
  if (firstSeen !== 0) return firstSeen;
  const created = compareDate(left.createdAt, right.createdAt);
  if (created !== 0) return created;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function selectPrimary(
  articles: readonly PersistedArticle[],
  context: SourcePriorityContext,
): PersistedArticle {
  const first = articles[0];
  if (first === undefined)
    throw new Error('cannot select Primary from no Articles');
  return articles
    .slice(1)
    .reduce(
      (preferred, candidate) =>
        comparePrimaryCandidates(candidate, preferred, context) < 0
          ? candidate
          : preferred,
      first,
    );
}

function requiredPriority(
  context: SourcePriorityContext,
  sourceId: string,
): number {
  const priority = context.priorities.get(sourceId);
  if (priority === undefined || !Number.isSafeInteger(priority)) {
    throw new Error(`missing valid priority for Source ${sourceId}`);
  }
  return priority;
}

function metadataCompleteness(article: PersistedArticle): number {
  return [
    article.author,
    article.summary,
    article.imageUrl,
    article.language,
  ].filter((value) => value !== undefined).length;
}

function httpsQuality(article: PersistedArticle): number {
  try {
    return new URL(article.originalUrl).protocol.toLowerCase() === 'https:'
      ? 1
      : 0;
  } catch {
    return 0;
  }
}

function comparePublicationTime(
  left: PersistedArticle,
  right: PersistedArticle,
): number {
  const leftTime = crediblePublicationTime(left);
  const rightTime = crediblePublicationTime(right);
  if (leftTime === undefined || rightTime === undefined) {
    return leftTime === undefined && rightTime === undefined
      ? 0
      : leftTime === undefined
        ? 1
        : -1;
  }
  return leftTime - rightTime;
}

function crediblePublicationTime(
  article: PersistedArticle,
): number | undefined {
  const time = article.publishedAt?.getTime();
  return article.publishedAtStatus === 'parsed' &&
    time !== undefined &&
    Number.isFinite(time)
    ? time
    : undefined;
}

function compareDate(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareDescending(left: number, right: number): number {
  return right - left;
}
