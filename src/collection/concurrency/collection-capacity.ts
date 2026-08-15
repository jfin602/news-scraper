import { createHash } from 'node:crypto';

import {
  DATABASE_POOL_MAX_CONNECTIONS,
  type Database,
  type DatabaseSession,
  type QueryExecutor,
} from '../../database/database.ts';
import { normalizeDomainHostname } from '../../sources/configuration.ts';

export const COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION = 2;
export const COLLECTION_MINIMUM_DATABASE_POOL_HEADROOM = 1;

export const COLLECTION_CAPACITY_LIMITS = Object.freeze({
  global: 4,
  source: 2,
  host: 2,
} as const);

export const COLLECTION_DATABASE_POOL_POLICY = Object.freeze({
  maxConnections: DATABASE_POOL_MAX_CONNECTIONS,
  pinnedSessionsPerExecution: COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION,
  minimumHeadroomConnections: COLLECTION_MINIMUM_DATABASE_POOL_HEADROOM,
  pinnedConnectionsAtGlobalLimit:
    COLLECTION_CAPACITY_LIMITS.global *
    COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION,
  availableConnectionsAtGlobalLimit:
    DATABASE_POOL_MAX_CONNECTIONS -
    COLLECTION_CAPACITY_LIMITS.global *
      COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION,
});

export type CollectionCapacityScope = keyof typeof COLLECTION_CAPACITY_LIMITS;

export interface CollectionCapacityRequest {
  readonly sourceId: string;
  readonly destinationHost: string;
}

export interface CollectionCapacityAcquired<T> {
  readonly status: 'acquired';
  readonly value: T;
}

export interface CollectionCapacityBlocked {
  readonly status: 'blocked';
  readonly stage: 'capacity';
  readonly reason: 'collection_capacity_limited';
  readonly limitingScope: CollectionCapacityScope;
}

export type CollectionCapacityResult<T> =
  CollectionCapacityAcquired<T> | CollectionCapacityBlocked;

export type CollectionCapacitySlotSetRequest =
  | { readonly scope: 'global' }
  | { readonly scope: 'source'; readonly sourceId: string }
  | { readonly scope: 'host'; readonly destinationHost: string };

export class CollectionCapacityError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Collection capacity failed: ${reason}`, options);
    this.name = 'CollectionCapacityError';
  }
}

/*
 * Every execution holds one capacity session and one endpoint-lock session.
 * Keeping at least one additional pool connection prevents persistence work
 * from being starved when all global slots are occupied.
 */
const COLLECTION_REQUIRED_DATABASE_POOL_CONNECTIONS =
  COLLECTION_DATABASE_POOL_POLICY.pinnedConnectionsAtGlobalLimit +
  COLLECTION_DATABASE_POOL_POLICY.minimumHeadroomConnections;

if (
  COLLECTION_REQUIRED_DATABASE_POOL_CONNECTIONS > DATABASE_POOL_MAX_CONNECTIONS
) {
  throw new CollectionCapacityError(
    `database pool requires at least ${COLLECTION_REQUIRED_DATABASE_POOL_CONNECTIONS} connections`,
  );
}

interface CapacitySlot {
  readonly scope: CollectionCapacityScope;
  readonly slotIndex: number;
  readonly key: string;
}

interface CapacitySlotGroup {
  readonly scope: CollectionCapacityScope;
  readonly slots: readonly CapacitySlot[];
}

const CAPACITY_LOCK_NAMESPACE = 'news-scraper:collection-capacity:';
const SOURCE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function globalCollectionCapacitySlotKey(slotIndex: number): string {
  validateSlotIndex('global', slotIndex);
  return capacityLockKey(`global:${slotIndex}`);
}

export function sourceCollectionCapacitySlotKey(
  sourceId: string,
  slotIndex: number,
): string {
  validateSourceId(sourceId);
  validateSlotIndex('source', slotIndex);
  return capacityLockKey(`source:${sourceId.toLowerCase()}:${slotIndex}`);
}

export function hostCollectionCapacitySlotKey(
  destinationHost: string,
  slotIndex: number,
): string {
  const normalizedHost = normalizeDomainHostname(destinationHost);
  validateSlotIndex('host', slotIndex);
  return capacityLockKey(`host:${normalizedHost}:${slotIndex}`);
}

export function collectionCapacitySlotSet(
  request: CollectionCapacitySlotSetRequest,
): readonly string[] {
  switch (request.scope) {
    case 'global':
      return boundedSlotSet('global', globalCollectionCapacitySlotKey);
    case 'source':
      return boundedSlotSet('source', (slotIndex) =>
        sourceCollectionCapacitySlotKey(request.sourceId, slotIndex),
      );
    case 'host':
      return boundedSlotSet('host', (slotIndex) =>
        hostCollectionCapacitySlotKey(request.destinationHost, slotIndex),
      );
  }
}

export async function withCollectionCapacity<T>(
  database: Pick<Database, 'withSession'>,
  request: CollectionCapacityRequest,
  work: (executor: QueryExecutor) => Promise<T>,
): Promise<CollectionCapacityResult<T>> {
  const slotGroups = capacitySlotGroups(request);

  return database.withSession(async (session) => {
    const acquiredSlots: CapacitySlot[] = [];

    for (const group of slotGroups) {
      const slot = await acquireFirstAvailableSlot(session, group.slots);
      if (slot === undefined) {
        const releaseFailure = await releaseSlots(session, acquiredSlots);
        if (releaseFailure !== undefined) throw releaseFailure;
        return blockedResult(group.scope);
      }
      acquiredSlots.push(slot);
    }

    let workCompleted = false;
    let workValue!: T;
    let workFailure: unknown;
    let releaseFailure: CollectionCapacityError | undefined;
    try {
      workValue = await work(session);
      workCompleted = true;
    } catch (error) {
      workFailure = error;
    } finally {
      releaseFailure = await releaseSlots(session, acquiredSlots);
    }

    if (releaseFailure !== undefined) {
      if (!workCompleted) {
        throw new AggregateError(
          [workFailure, releaseFailure],
          'Collection capacity work and release both failed.',
          { cause: releaseFailure },
        );
      }
      throw releaseFailure;
    }
    if (!workCompleted) throw workFailure;

    return Object.freeze({ status: 'acquired', value: workValue });
  });
}

function capacitySlotGroups(
  request: CollectionCapacityRequest,
): readonly CapacitySlotGroup[] {
  validateSourceId(request.sourceId);
  const normalizedHost = normalizeDomainHostname(request.destinationHost);

  return Object.freeze([
    Object.freeze({
      scope: 'global' as const,
      slots: slotsForScope(
        'global',
        collectionCapacitySlotSet({ scope: 'global' }),
      ),
    }),
    Object.freeze({
      scope: 'source' as const,
      slots: slotsForScope(
        'source',
        collectionCapacitySlotSet({
          scope: 'source',
          sourceId: request.sourceId,
        }),
      ),
    }),
    Object.freeze({
      scope: 'host' as const,
      slots: slotsForScope(
        'host',
        collectionCapacitySlotSet({
          scope: 'host',
          destinationHost: normalizedHost,
        }),
      ),
    }),
  ]);
}

function slotsForScope(
  scope: CollectionCapacityScope,
  keys: readonly string[],
): readonly CapacitySlot[] {
  return Object.freeze(
    keys.map((key, slotIndex) => Object.freeze({ scope, slotIndex, key })),
  );
}

function boundedSlotSet(
  scope: CollectionCapacityScope,
  keyForSlot: (slotIndex: number) => string,
): readonly string[] {
  return Object.freeze(
    Array.from({ length: COLLECTION_CAPACITY_LIMITS[scope] }, (_, slotIndex) =>
      keyForSlot(slotIndex),
    ),
  );
}

async function acquireFirstAvailableSlot(
  session: DatabaseSession,
  slots: readonly CapacitySlot[],
): Promise<CapacitySlot | undefined> {
  for (const slot of slots) {
    if (await acquireLock(session, slot.key)) return slot;
  }
  return undefined;
}

async function acquireLock(
  session: DatabaseSession,
  key: string,
): Promise<boolean> {
  try {
    const result = await session.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      [key],
    );
    const acquired = result.rows[0]?.acquired;
    if (acquired === true || acquired === false) return acquired;

    session.discard();
    throw new CollectionCapacityError(
      'slot acquisition returned an invalid result',
    );
  } catch (error) {
    session.discard();
    throw error;
  }
}

async function releaseSlots(
  session: DatabaseSession,
  acquiredSlots: readonly CapacitySlot[],
): Promise<CollectionCapacityError | undefined> {
  for (let index = acquiredSlots.length - 1; index >= 0; index -= 1) {
    const slot = acquiredSlots[index];
    if (slot === undefined) continue;

    const failure = await releaseLock(session, slot);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

async function releaseLock(
  session: DatabaseSession,
  slot: CapacitySlot,
): Promise<CollectionCapacityError | undefined> {
  try {
    const result = await session.query<{ released: boolean }>(
      'SELECT pg_advisory_unlock($1::bigint) AS released',
      [slot.key],
    );
    if (result.rows[0]?.released === true) return undefined;

    session.discard();
    return new CollectionCapacityError(
      `${slot.scope} slot ${slot.slotIndex} release was not confirmed`,
    );
  } catch (error) {
    session.discard();
    return new CollectionCapacityError(
      `${slot.scope} slot ${slot.slotIndex} release could not be completed`,
      { cause: error },
    );
  }
}

function blockedResult(
  limitingScope: CollectionCapacityScope,
): CollectionCapacityBlocked {
  return Object.freeze({
    status: 'blocked',
    stage: 'capacity',
    reason: 'collection_capacity_limited',
    limitingScope,
  });
}

function capacityLockKey(identity: string): string {
  const digest = createHash('sha256')
    .update(`${CAPACITY_LOCK_NAMESPACE}${identity}`, 'utf8')
    .digest();
  return digest.readBigInt64BE(0).toString(10);
}

function validateSourceId(sourceId: string): void {
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new TypeError('Source id must be a UUID.');
  }
}

function validateSlotIndex(
  scope: CollectionCapacityScope,
  slotIndex: number,
): void {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= COLLECTION_CAPACITY_LIMITS[scope]
  ) {
    throw new RangeError(
      `${scope} slot index must be an integer from 0 through ${COLLECTION_CAPACITY_LIMITS[scope] - 1}.`,
    );
  }
}
