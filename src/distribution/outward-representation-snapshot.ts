import type { Database, RepeatableReadDatabase } from '../database/database.ts';
import {
  readActiveProfileDigestInSnapshot,
  type ActiveProfileDigest,
} from './digests/lifecycle.ts';
import {
  readDistributionProfileSnapshotInTransaction,
  type DistributionProfileReadOutcome,
  type DistributionProfileSnapshot,
} from './profile-snapshot.ts';

/**
 * The complete outward state. P1's canonical Article snapshot remains digest
 * independent; this consumer-only composition is the permanent v1 snapshot.
 */
export interface DistributionProfileRepresentationSnapshot extends DistributionProfileSnapshot {
  readonly digest: ActiveProfileDigest | null;
}

export type DistributionProfileRepresentationReadOutcome =
  | Exclude<DistributionProfileReadOutcome, { kind: 'active' }>
  | Readonly<{
      kind: 'active';
      snapshot: DistributionProfileRepresentationSnapshot;
    }>;

export interface DistributionProfileRepresentationSnapshotService {
  read(
    profileConfigKey: unknown,
  ): Promise<DistributionProfileRepresentationReadOutcome>;
}

export function createDistributionProfileRepresentationSnapshotService(
  database: Database,
  now: () => Date = () => new Date(),
): DistributionProfileRepresentationSnapshotService {
  const repeatableReadDatabase = database as RepeatableReadDatabase;
  return Object.freeze({
    async read(
      profileConfigKey: unknown,
    ): Promise<DistributionProfileRepresentationReadOutcome> {
      let capturedNow: Date;
      try {
        capturedNow = requiredNow(now);
        if (
          repeatableReadDatabase.readOnlyRepeatableReadTransaction === undefined
        ) {
          throw new Error('repeatable-read transaction is unavailable');
        }
        return await repeatableReadDatabase.readOnlyRepeatableReadTransaction(
          async (transaction) => {
            const canonical =
              await readDistributionProfileSnapshotInTransaction(
                transaction,
                profileConfigKey,
              );
            if (canonical.kind !== 'active') return canonical;
            const digest = await readActiveProfileDigestInSnapshot(
              transaction,
              canonical.snapshot,
              capturedNow,
            );
            return Object.freeze({
              kind: 'active' as const,
              snapshot: Object.freeze({ ...canonical.snapshot, digest }),
            });
          },
        );
      } catch {
        return Object.freeze({ kind: 'read_failed' });
      }
    },
  });
}

function requiredNow(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Outward representation clock is invalid.');
  }
  return new Date(value.getTime());
}
