import type { QueryResultRow } from 'pg';

import {
  findCategoryByConfigKey,
  setEndpointDefaultCategory,
} from '../collection/relevance/repository.ts';
import { evaluateCollectionEligibility } from '../collection/eligibility.ts';
import {
  DEFAULT_RECENT_COLLECTION_RUN_LIMIT,
  MAX_RECENT_COLLECTION_RUN_LIMIT,
  listRecentCollectionRunsForEndpoint,
  type CollectionRunNormalizationStatus,
  type CollectionRunOutcomeCode,
  type CollectionRunParserStatus,
  type CollectionRunProcessingStatus,
  type CollectionRunStatus,
  type CollectionRunTransportStatus,
  type CollectionRunTriggerKind,
  type PersistedCollectionRun,
} from '../collection/runs/repository.ts';
import type { RetryClassification } from '../collection/fetchers/fetcher.ts';
import { type Database, type QueryExecutor } from '../database/database.ts';
import {
  enqueueEndpointCollectionJob,
  type EndpointCollectionJobStatus,
  type EndpointCollectionJobTriggerKind,
  type PersistedEndpointCollectionJob,
} from '../jobs/endpoint-collection-job-repository.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import { readPublicationSettings } from '../publication/repository.ts';
import {
  normalizeApprovalState,
  normalizeConfigKey,
  normalizeDomainRules,
  normalizeEndpointType,
  normalizeLifecycleState,
  normalizeOperationalState,
  normalizePollIntervalSeconds,
  normalizeSourceEndpointConfigurationForSource,
  parseEndpointUrl,
  type ApprovalState,
  type DomainRule,
  type EndpointType,
  type LifecycleState,
  type OperationalState,
  type SourceEndpointConfiguration,
} from '../sources/configuration.ts';
import {
  findSourceEndpointBySourceAndConfigKey,
  insertSourceEndpoint,
} from '../sources/repository.ts';
import {
  readEndpointHealth,
  type EndpointHealth,
} from '../sources/endpoint-health.ts';

export const ENDPOINT_ADMINISTRATION_LIST_LIMIT = 500;
export const ENDPOINT_ADMINISTRATION_RECENT_RUNS_DEFAULT_LIMIT =
  DEFAULT_RECENT_COLLECTION_RUN_LIMIT;
export const ENDPOINT_ADMINISTRATION_RECENT_RUNS_MAX_LIMIT =
  MAX_RECENT_COLLECTION_RUN_LIMIT;

export type EndpointAdministrationErrorCode =
  | 'category_not_found'
  | 'endpoint_archived'
  | 'endpoint_config_key_conflict'
  | 'endpoint_domain_policy_conflict'
  | 'endpoint_not_found'
  | 'endpoint_not_collectable'
  | 'endpoint_url_conflict'
  | 'invalid_request'
  | 'source_archived'
  | 'source_not_found';

export class EndpointAdministrationError extends Error {
  readonly code: EndpointAdministrationErrorCode;
  readonly reason: EndpointNotCollectableReason | undefined;

  constructor(
    code: EndpointAdministrationErrorCode,
    reason?: EndpointNotCollectableReason,
  ) {
    super(`Endpoint administration command failed: ${code}`);
    this.name = 'EndpointAdministrationError';
    this.code = code;
    this.reason = reason;
  }
}

export type EndpointNotCollectableReason =
  | 'publication_inactive'
  | 'source_unapproved'
  | 'source_archived'
  | 'source_paused'
  | 'source_disabled'
  | 'endpoint_unapproved'
  | 'endpoint_archived'
  | 'endpoint_paused'
  | 'endpoint_disabled';

export interface AdminEndpointCategoryChoice {
  readonly configKey: string;
  readonly displayName: string;
}

export interface AdminEndpointReadModel {
  readonly sourceConfigKey: string;
  readonly configKey: string;
  readonly endpointUrl: string;
  readonly endpointType: EndpointType;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly pollIntervalSeconds: number;
  readonly endpointDomainRules: readonly DomainRule[];
  readonly inheritsSourceDomainPolicy: boolean;
  readonly defaultCategory: AdminEndpointCategoryChoice | null;
}

export interface AdminEndpointCollectionJobReadModel {
  readonly id: string;
  readonly triggerKind: EndpointCollectionJobTriggerKind;
  readonly status: 'queued' | 'running';
  readonly availableAt: Date;
  readonly attemptNumber: number;
}

export interface AdminEndpointCheckNowReadModel {
  readonly disposition: 'queued' | 'already_outstanding';
  readonly job: AdminEndpointCollectionJobReadModel;
}

export interface AdminEndpointHealthReadModel {
  readonly sourceConfigKey: string;
  readonly endpointConfigKey: string;
  readonly publicationActiveForCollection: boolean;
  readonly sourceApprovalState: ApprovalState;
  readonly sourceLifecycleState: LifecycleState;
  readonly sourceOperationalState: OperationalState;
  readonly endpointApprovalState: ApprovalState;
  readonly endpointLifecycleState: LifecycleState;
  readonly endpointOperationalState: OperationalState;
  readonly derivedHealth: EndpointHealth;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly nextDueAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly consecutiveFailureCount: number;
  readonly pollIntervalSeconds: number;
}

export interface AdminEndpointCollectionRunReadModel {
  readonly id: string;
  readonly triggerKind: CollectionRunTriggerKind;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly runStatus: CollectionRunStatus;
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly normalizationStatus: CollectionRunNormalizationStatus;
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly outcomeCode: CollectionRunOutcomeCode | null;
  readonly retryClassification: RetryClassification | null;
  readonly httpStatusCode: number | null;
  readonly redirectCount: number | null;
  readonly transportElapsedMilliseconds: number | null;
  readonly wireByteCount: number | null;
  readonly decompressedByteCount: number | null;
  readonly rawItemCount: number;
  readonly sourceItemFilteredCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
}

export interface AdminEndpointCollectionRunsReadModel {
  readonly sourceConfigKey: string;
  readonly endpointConfigKey: string;
  readonly limit: number;
  readonly runs: readonly AdminEndpointCollectionRunReadModel[];
}

export interface EndpointAdministrationService {
  listEndpoints(
    sourceConfigKey: unknown,
  ): Promise<readonly AdminEndpointReadModel[]>;
  getEndpoint(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
  ): Promise<AdminEndpointReadModel>;
  createEndpoint(
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminEndpointReadModel>;
  replaceEndpointConfiguration(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
    input: unknown,
  ): Promise<AdminEndpointReadModel>;
  setEndpointApproval(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
    input: unknown,
  ): Promise<AdminEndpointReadModel>;
  setEndpointOperationalState(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
    input: unknown,
  ): Promise<AdminEndpointReadModel>;
  setEndpointLifecycle(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
    input: unknown,
  ): Promise<AdminEndpointReadModel>;
  checkNow(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
  ): Promise<AdminEndpointCheckNowReadModel>;
  getEndpointHealth(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
  ): Promise<AdminEndpointHealthReadModel>;
  listRecentRuns(
    sourceConfigKey: unknown,
    endpointConfigKey: unknown,
    limit?: unknown,
  ): Promise<AdminEndpointCollectionRunsReadModel>;
}

interface SourceIdentityRow extends QueryResultRow {
  readonly id: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
}

interface EndpointReadRow extends QueryResultRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly endpoint_url: unknown;
  readonly endpoint_type: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly default_category_config_key: unknown;
  readonly default_category_display_name: unknown;
}

interface DomainRuleRow extends QueryResultRow {
  readonly owner_id: unknown;
  readonly hostname: unknown;
  readonly include_subdomains: unknown;
}

interface LockedSource {
  readonly id: string;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly domainRules: readonly DomainRule[];
}

interface LockedEndpoint {
  readonly id: string;
  readonly configKey: string;
  readonly endpointUrl: string;
  readonly endpointType: EndpointType;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly pollIntervalSeconds: number;
  readonly endpointDomainRules: readonly DomainRule[];
}

export interface NormalizedEndpointCreateCommand {
  readonly endpoint: Readonly<SourceEndpointConfiguration>;
  readonly defaultCategoryConfigKey?: string;
}

interface NormalizedMutableEndpointConfiguration {
  readonly endpointUrl: string;
  readonly endpointType: EndpointType;
  readonly pollIntervalSeconds: number;
  readonly endpointDomainRules: readonly DomainRule[];
  readonly defaultCategoryConfigKey?: string;
}

export interface EndpointAdministrationDependencies {
  readonly now?: () => Date;
}

const ENDPOINT_CREATE_KEYS = [
  'configKey',
  'endpointUrl',
  'endpointType',
  'approvalState',
  'operationalState',
  'pollIntervalSeconds',
  'endpointDomainRules',
  'defaultCategoryConfigKey',
] as const;

const ENDPOINT_CONFIGURATION_KEYS = [
  'endpointUrl',
  'endpointType',
  'pollIntervalSeconds',
  'endpointDomainRules',
  'defaultCategoryConfigKey',
] as const;

export function createEndpointAdministrationService(
  database: Database,
  dependencies: EndpointAdministrationDependencies = {},
): EndpointAdministrationService {
  const now = dependencies.now ?? (() => new Date());
  return Object.freeze({
    async listEndpoints(sourceConfigKey: unknown) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const source = await resolveSource(database, sourceKey);
      return readEndpoints(database, sourceKey, source.id);
    },

    async getEndpoint(sourceConfigKey: unknown, endpointConfigKey: unknown) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const endpointKey = normalizedKey(endpointConfigKey);
      const source = await resolveSource(database, sourceKey);
      return requireEndpointReadModel(
        database,
        sourceKey,
        source.id,
        endpointKey,
      );
    },

    async createEndpoint(sourceConfigKey: unknown, input: unknown) {
      const sourceKey = normalizedKey(sourceConfigKey);
      try {
        return await database.transaction(async (transaction) => {
          const source = await lockSource(transaction, sourceKey);
          if (source.lifecycleState === 'archived') {
            throw new EndpointAdministrationError('source_archived');
          }
          const command = normalizeEndpointCreateCommand(
            input,
            source.domainRules,
          );
          await requireCategory(transaction, command.defaultCategoryConfigKey);
          const endpoint = await insertSourceEndpoint(transaction, source.id, {
            configKey: command.endpoint.configKey,
            endpointUrl: command.endpoint.endpointUrl.value,
            endpointType: command.endpoint.endpointType,
            approvalState: command.endpoint.approvalState,
            lifecycleState: command.endpoint.lifecycleState,
            operationalState: command.endpoint.operationalState,
            pollIntervalSeconds: command.endpoint.pollIntervalSeconds,
            endpointDomainRules: command.endpoint.endpointDomainRules,
          });
          await setEndpointDefaultCategory(
            transaction,
            endpoint.id,
            command.defaultCategoryConfigKey,
          );
          return requireEndpointReadModel(
            transaction,
            sourceKey,
            source.id,
            command.endpoint.configKey,
          );
        });
      } catch (error) {
        throw mapEndpointConstraintError(error);
      }
    },

    async replaceEndpointConfiguration(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
      input: unknown,
    ) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const endpointKey = normalizedKey(endpointConfigKey);
      try {
        return await database.transaction(async (transaction) => {
          const source = await lockSource(transaction, sourceKey);
          const endpoint = await lockEndpoint(
            transaction,
            source.id,
            endpointKey,
          );
          const command = normalizeMutableEndpointConfiguration(
            input,
            source.domainRules,
            endpoint,
          );
          await requireCategory(transaction, command.defaultCategoryConfigKey);
          await transaction.query(
            `UPDATE source_endpoints
             SET endpoint_url = $2, endpoint_type = $3,
                 poll_interval_seconds = $4, updated_at = now()
             WHERE id = $1`,
            [
              endpoint.id,
              command.endpointUrl,
              command.endpointType,
              command.pollIntervalSeconds,
            ],
          );
          await replaceEndpointDomainRules(
            transaction,
            endpoint.id,
            command.endpointDomainRules,
          );
          await setEndpointDefaultCategory(
            transaction,
            endpoint.id,
            command.defaultCategoryConfigKey,
          );
          return requireEndpointReadModel(
            transaction,
            sourceKey,
            source.id,
            endpointKey,
          );
        });
      } catch (error) {
        throw mapEndpointConstraintError(error);
      }
    },

    async setEndpointApproval(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
      input: unknown,
    ) {
      return updateLockedEndpoint(
        database,
        sourceConfigKey,
        endpointConfigKey,
        async (transaction, source, endpoint) => {
          const command = exactRecord(input, ['approvalState']);
          const approvalState = normalizeAdminValue(() =>
            normalizeApprovalState(command.approvalState),
          );
          validateEndpointPolicy(source.domainRules, endpoint, approvalState);
          await transaction.query(
            `UPDATE source_endpoints
             SET approval_state = $2, updated_at = now()
             WHERE id = $1`,
            [endpoint.id, approvalState],
          );
        },
      );
    },

    async setEndpointOperationalState(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
      input: unknown,
    ) {
      return updateLockedEndpoint(
        database,
        sourceConfigKey,
        endpointConfigKey,
        async (transaction, _source, endpoint) => {
          const command = exactRecord(input, ['operationalState']);
          const operationalState = normalizeAdminValue(() =>
            normalizeOperationalState(command.operationalState),
          );
          if (endpoint.lifecycleState === 'archived') {
            throw new EndpointAdministrationError('endpoint_archived');
          }
          await transaction.query(
            `UPDATE source_endpoints
             SET operational_state = $2, updated_at = now()
             WHERE id = $1`,
            [endpoint.id, operationalState],
          );
        },
      );
    },

    async setEndpointLifecycle(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
      input: unknown,
    ) {
      return updateLockedEndpoint(
        database,
        sourceConfigKey,
        endpointConfigKey,
        async (transaction, _source, endpoint) => {
          const command = exactRecord(input, ['lifecycleState']);
          const lifecycleState = normalizeAdminValue(() =>
            normalizeLifecycleState(command.lifecycleState),
          );
          await transaction.query(
            `UPDATE source_endpoints
             SET lifecycle_state = $2, operational_state = 'disabled',
                 updated_at = now()
             WHERE id = $1`,
            [endpoint.id, lifecycleState],
          );
        },
      );
    },

    async checkNow(sourceConfigKey: unknown, endpointConfigKey: unknown) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const endpointKey = normalizedKey(endpointConfigKey);
      const requestedAt = requiredDate(now());
      return database.transaction(async (transaction) => {
        // Share the P4/P5 Source -> endpoint configuration lock order. This is
        // deliberately not the Worker collection-run lock.
        const source = await lockSource(transaction, sourceKey);
        const endpoint = await lockEndpoint(
          transaction,
          source.id,
          endpointKey,
        );
        const publication = await readPublicationSettings(transaction);
        const eligibility = evaluateCollectionEligibility({
          publication: {
            activeForCollection: publication?.activeForCollection === true,
          },
          source,
          endpoint,
        });
        if (eligibility.status === 'blocked') {
          throw new EndpointAdministrationError(
            'endpoint_not_collectable',
            endpointNotCollectableReason(eligibility.reason),
          );
        }
        const enqueued = await enqueueEndpointCollectionJob(transaction, {
          sourceEndpointId: endpoint.id,
          triggerKind: 'manual',
          availableAt: requestedAt,
          attemptNumber: 1,
        });
        return Object.freeze({
          disposition: enqueued.created ? 'queued' : 'already_outstanding',
          job: mapOutstandingJob(enqueued.job),
        });
      });
    },

    async getEndpointHealth(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
    ) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const endpointKey = normalizedKey(endpointConfigKey);
      const endpointId = await resolveEndpointId(
        database,
        sourceKey,
        endpointKey,
      );
      const health = await readEndpointHealth(
        database,
        endpointId,
        requiredDate(now()),
      );
      if (health === undefined) {
        throw new EndpointAdministrationError('endpoint_not_found');
      }
      return Object.freeze({
        sourceConfigKey: sourceKey,
        endpointConfigKey: endpointKey,
        publicationActiveForCollection:
          health.configuration.publicationActiveForCollection,
        sourceApprovalState: health.configuration.sourceApprovalState,
        sourceLifecycleState: health.configuration.sourceLifecycleState,
        sourceOperationalState: health.configuration.sourceOperationalState,
        endpointApprovalState: health.configuration.endpointApprovalState,
        endpointLifecycleState: health.configuration.endpointLifecycleState,
        endpointOperationalState: health.configuration.endpointOperationalState,
        derivedHealth: health.health,
        lastAttemptAt: health.runtime.lastAttemptAt ?? null,
        lastSuccessAt: health.runtime.lastSuccessAt ?? null,
        lastFailureAt: health.runtime.lastFailureAt ?? null,
        nextDueAt: health.runtime.nextDueAt ?? null,
        cooldownUntil: health.runtime.cooldownUntil ?? null,
        consecutiveFailureCount: health.runtime.consecutiveFailureCount,
        pollIntervalSeconds: health.configuration.pollIntervalSeconds,
      });
    },

    async listRecentRuns(
      sourceConfigKey: unknown,
      endpointConfigKey: unknown,
      requestedLimit?: unknown,
    ) {
      const sourceKey = normalizedKey(sourceConfigKey);
      const endpointKey = normalizedKey(endpointConfigKey);
      const limit = normalizeRecentRunsLimit(requestedLimit);
      const endpointId = await resolveEndpointId(
        database,
        sourceKey,
        endpointKey,
      );
      const runs = await listRecentCollectionRunsForEndpoint(
        database,
        endpointId,
        limit,
      );
      return Object.freeze({
        sourceConfigKey: sourceKey,
        endpointConfigKey: endpointKey,
        limit,
        runs: Object.freeze(runs.map(mapCollectionRun)),
      });
    },
  });
}

async function updateLockedEndpoint(
  database: Database,
  sourceConfigKey: unknown,
  endpointConfigKey: unknown,
  update: (
    transaction: QueryExecutor,
    source: LockedSource,
    endpoint: LockedEndpoint,
  ) => Promise<void>,
): Promise<AdminEndpointReadModel> {
  const sourceKey = normalizedKey(sourceConfigKey);
  const endpointKey = normalizedKey(endpointConfigKey);
  return database.transaction(async (transaction) => {
    const source = await lockSource(transaction, sourceKey);
    const endpoint = await lockEndpoint(transaction, source.id, endpointKey);
    await update(transaction, source, endpoint);
    return requireEndpointReadModel(
      transaction,
      sourceKey,
      source.id,
      endpointKey,
    );
  });
}

// Administrative mutations share P4's Source -> endpoint lock order.
async function lockSource(
  executor: QueryExecutor,
  sourceConfigKey: string,
): Promise<LockedSource> {
  const result = await executor.query<SourceIdentityRow>(
    `SELECT id, approval_state, lifecycle_state, operational_state
     FROM sources
     WHERE config_key = $1
     FOR UPDATE`,
    [sourceConfigKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new EndpointAdministrationError('source_not_found');
  }
  const id = requiredString(row.id);
  return Object.freeze({
    id,
    approvalState: normalizeApprovalState(row.approval_state),
    lifecycleState: normalizeLifecycleState(row.lifecycle_state),
    operationalState: normalizeOperationalState(row.operational_state),
    domainRules: await loadSourceDomainRules(executor, id),
  });
}

async function resolveSource(
  executor: QueryExecutor,
  sourceConfigKey: string,
): Promise<Pick<LockedSource, 'id' | 'lifecycleState'>> {
  const result = await executor.query<SourceIdentityRow>(
    `SELECT id, approval_state, lifecycle_state, operational_state
     FROM sources
     WHERE config_key = $1`,
    [sourceConfigKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new EndpointAdministrationError('source_not_found');
  }
  return Object.freeze({
    id: requiredString(row.id),
    lifecycleState: normalizeLifecycleState(row.lifecycle_state),
  });
}

async function resolveEndpointId(
  executor: QueryExecutor,
  sourceConfigKey: string,
  endpointConfigKey: string,
): Promise<string> {
  const source = await resolveSource(executor, sourceConfigKey);
  const endpoint = await findSourceEndpointBySourceAndConfigKey(
    executor,
    source.id,
    endpointConfigKey,
  );
  if (endpoint === undefined) {
    throw new EndpointAdministrationError('endpoint_not_found');
  }
  return endpoint.id;
}

async function lockEndpoint(
  executor: QueryExecutor,
  sourceId: string,
  endpointConfigKey: string,
): Promise<LockedEndpoint> {
  const result = await executor.query<EndpointReadRow>(
    `SELECT endpoint.id, endpoint.config_key, endpoint.endpoint_url,
            endpoint.endpoint_type, endpoint.approval_state,
            endpoint.lifecycle_state, endpoint.operational_state,
            endpoint.poll_interval_seconds,
            NULL AS default_category_config_key,
            NULL AS default_category_display_name
     FROM source_endpoints endpoint
     WHERE endpoint.source_id = $1 AND endpoint.config_key = $2
     FOR UPDATE`,
    [sourceId, endpointConfigKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new EndpointAdministrationError('endpoint_not_found');
  }
  const id = requiredString(row.id);
  return Object.freeze({
    id,
    configKey: normalizeConfigKey(row.config_key),
    endpointUrl: parseEndpointUrl(row.endpoint_url).value,
    endpointType: normalizeEndpointType(row.endpoint_type),
    approvalState: normalizeApprovalState(row.approval_state),
    lifecycleState: normalizeLifecycleState(row.lifecycle_state),
    operationalState: normalizeOperationalState(row.operational_state),
    pollIntervalSeconds: normalizePollIntervalSeconds(
      row.poll_interval_seconds,
    ),
    endpointDomainRules: await loadEndpointDomainRules(executor, id),
  });
}

async function requireEndpointReadModel(
  executor: QueryExecutor,
  sourceConfigKey: string,
  sourceId: string,
  endpointConfigKey: string,
): Promise<AdminEndpointReadModel> {
  const endpoints = await readEndpoints(
    executor,
    sourceConfigKey,
    sourceId,
    endpointConfigKey,
  );
  const endpoint = endpoints[0];
  if (endpoint === undefined) {
    throw new EndpointAdministrationError('endpoint_not_found');
  }
  return endpoint;
}

async function readEndpoints(
  executor: QueryExecutor,
  sourceConfigKey: string,
  sourceId: string,
  endpointConfigKey?: string,
): Promise<readonly AdminEndpointReadModel[]> {
  const values: unknown[] = [sourceId];
  const endpointPredicate =
    endpointConfigKey === undefined
      ? ''
      : `AND endpoint.config_key = $${String(values.push(endpointConfigKey))}`;
  const limit =
    endpointConfigKey === undefined
      ? `LIMIT $${String(values.push(ENDPOINT_ADMINISTRATION_LIST_LIMIT))}`
      : '';
  const result = await executor.query<EndpointReadRow>(
    `SELECT endpoint.id, endpoint.config_key, endpoint.endpoint_url,
            endpoint.endpoint_type, endpoint.approval_state,
            endpoint.lifecycle_state, endpoint.operational_state,
            endpoint.poll_interval_seconds,
            category.config_key AS default_category_config_key,
            category.display_name AS default_category_display_name
     FROM source_endpoints endpoint
     LEFT JOIN categories category ON category.id = endpoint.default_category_id
     WHERE endpoint.source_id = $1 ${endpointPredicate}
     ORDER BY endpoint.config_key ASC
     ${limit}`,
    values,
  );
  if (result.rows.length === 0) return Object.freeze([]);
  const endpointIds = result.rows.map((row) => requiredString(row.id));
  const domainResult = await executor.query<DomainRuleRow>(
    `SELECT source_endpoint_id AS owner_id, hostname, include_subdomains
     FROM source_endpoint_domain_rules
     WHERE source_endpoint_id = ANY($1::uuid[])
     ORDER BY source_endpoint_id ASC, hostname ASC`,
    [endpointIds],
  );
  const domains = groupDomainRules(domainResult.rows);
  return Object.freeze(
    result.rows.map((row) =>
      mapEndpointReadRow(
        sourceConfigKey,
        row,
        domains.get(requiredString(row.id)) ?? [],
      ),
    ),
  );
}

function mapEndpointReadRow(
  sourceConfigKey: string,
  row: EndpointReadRow,
  endpointDomainRules: readonly DomainRule[],
): AdminEndpointReadModel {
  try {
    const categoryKey = nullableString(row.default_category_config_key);
    const categoryName = nullableString(row.default_category_display_name);
    if ((categoryKey === undefined) !== (categoryName === undefined)) {
      throw new Error();
    }
    return Object.freeze({
      sourceConfigKey,
      configKey: normalizeConfigKey(row.config_key),
      endpointUrl: parseEndpointUrl(row.endpoint_url).value,
      endpointType: normalizeEndpointType(row.endpoint_type),
      approvalState: normalizeApprovalState(row.approval_state),
      lifecycleState: normalizeLifecycleState(row.lifecycle_state),
      operationalState: normalizeOperationalState(row.operational_state),
      pollIntervalSeconds: normalizePollIntervalSeconds(
        row.poll_interval_seconds,
      ),
      endpointDomainRules: Object.freeze([...endpointDomainRules]),
      inheritsSourceDomainPolicy: endpointDomainRules.length === 0,
      defaultCategory:
        categoryKey === undefined || categoryName === undefined
          ? null
          : Object.freeze({
              configKey: categoryKey,
              displayName: categoryName,
            }),
    });
  } catch {
    throw new Error('Database returned invalid endpoint administration data');
  }
}

function mapOutstandingJob(
  job: PersistedEndpointCollectionJob,
): AdminEndpointCollectionJobReadModel {
  const status: EndpointCollectionJobStatus = job.status;
  if (status !== 'queued' && status !== 'running') {
    throw new Error('Enqueue returned a non-outstanding endpoint job');
  }
  return Object.freeze({
    id: job.id,
    triggerKind: job.triggerKind,
    status,
    availableAt: job.availableAt,
    attemptNumber: job.attemptNumber,
  });
}

function mapCollectionRun(
  run: PersistedCollectionRun,
): AdminEndpointCollectionRunReadModel {
  return Object.freeze({
    id: run.id,
    triggerKind: run.triggerKind,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    runStatus: run.runStatus,
    transportStatus: run.transportStatus,
    parserStatus: run.parserStatus,
    normalizationStatus: run.normalizationStatus,
    processingStatus: run.processingStatus,
    outcomeCode: run.outcomeCode ?? null,
    retryClassification: run.retryClassification ?? null,
    httpStatusCode: run.httpStatusCode ?? null,
    redirectCount: run.redirectCount ?? null,
    transportElapsedMilliseconds: run.transportElapsedMilliseconds ?? null,
    wireByteCount: run.wireByteCount ?? null,
    decompressedByteCount: run.decompressedByteCount ?? null,
    rawItemCount: run.rawItemCount,
    sourceItemFilteredCount: run.sourceItemFilteredCount,
    normalizedCandidateCount: run.normalizedCandidateCount,
    normalizationFailureCount: run.normalizationFailureCount,
    articleLinkRejectionCount: run.articleLinkRejectionCount,
    createdCount: run.createdCount,
    updatedCount: run.updatedCount,
    unchangedCount: run.unchangedCount,
    rejectedCount: run.rejectedCount,
    excludedCount: run.excludedCount,
    failedCount: run.failedCount,
    errorCode: run.errorCode ?? null,
    errorDetail: run.errorDetail ?? null,
  });
}

function endpointNotCollectableReason(
  reason: string,
): EndpointNotCollectableReason {
  switch (reason) {
    case 'publication_inactive':
    case 'source_unapproved':
    case 'source_archived':
    case 'source_paused':
    case 'source_disabled':
    case 'endpoint_unapproved':
    case 'endpoint_archived':
    case 'endpoint_paused':
    case 'endpoint_disabled':
      return reason;
    default:
      throw new Error('Eligibility preflight returned a non-state reason');
  }
}

export function normalizeRecentRunsLimit(value: unknown): number {
  if (value === undefined) {
    return ENDPOINT_ADMINISTRATION_RECENT_RUNS_DEFAULT_LIMIT;
  }
  const limit =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9]\d*$/u.test(value)
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > ENDPOINT_ADMINISTRATION_RECENT_RUNS_MAX_LIMIT
  ) {
    throw new EndpointAdministrationError('invalid_request');
  }
  return limit;
}

export function normalizeEndpointCreateCommand(
  input: unknown,
  sourceDomainRules: readonly DomainRule[],
): NormalizedEndpointCreateCommand {
  const record = exactRecord(input, ENDPOINT_CREATE_KEYS);
  const defaultCategoryConfigKey = normalizeDefaultCategoryKey(
    record.defaultCategoryConfigKey,
  );
  const endpoint = normalizeEndpointConfiguration(() =>
    normalizeSourceEndpointConfigurationForSource(
      {
        configKey: record.configKey,
        endpointUrl: record.endpointUrl,
        endpointType: record.endpointType,
        approvalState: record.approvalState,
        lifecycleState: 'active',
        operationalState: record.operationalState,
        pollIntervalSeconds: record.pollIntervalSeconds,
        endpointDomainRules: record.endpointDomainRules,
      },
      sourceDomainRules,
    ),
  );
  return Object.freeze({
    endpoint,
    ...(defaultCategoryConfigKey === undefined
      ? {}
      : { defaultCategoryConfigKey }),
  });
}

function normalizeMutableEndpointConfiguration(
  input: unknown,
  sourceDomainRules: readonly DomainRule[],
  current: LockedEndpoint,
): NormalizedMutableEndpointConfiguration {
  const record = exactRecord(input, ENDPOINT_CONFIGURATION_KEYS);
  const defaultCategoryConfigKey = normalizeDefaultCategoryKey(
    record.defaultCategoryConfigKey,
  );
  const endpoint = normalizeEndpointConfiguration(() =>
    normalizeSourceEndpointConfigurationForSource(
      {
        configKey: current.configKey,
        endpointUrl: record.endpointUrl,
        endpointType: record.endpointType,
        approvalState: current.approvalState,
        lifecycleState: current.lifecycleState,
        operationalState: current.operationalState,
        pollIntervalSeconds: record.pollIntervalSeconds,
        endpointDomainRules: record.endpointDomainRules,
      },
      sourceDomainRules,
    ),
  );
  return Object.freeze({
    endpointUrl: endpoint.endpointUrl.value,
    endpointType: endpoint.endpointType,
    pollIntervalSeconds: endpoint.pollIntervalSeconds,
    endpointDomainRules: endpoint.endpointDomainRules,
    ...(defaultCategoryConfigKey === undefined
      ? {}
      : { defaultCategoryConfigKey }),
  });
}

function validateEndpointPolicy(
  sourceDomainRules: readonly DomainRule[],
  current: LockedEndpoint,
  approvalState: ApprovalState,
): void {
  normalizeEndpointConfiguration(() =>
    normalizeSourceEndpointConfigurationForSource(
      {
        configKey: current.configKey,
        endpointUrl: current.endpointUrl,
        endpointType: current.endpointType,
        approvalState,
        lifecycleState: current.lifecycleState,
        operationalState: current.operationalState,
        pollIntervalSeconds: current.pollIntervalSeconds,
        endpointDomainRules: current.endpointDomainRules,
      },
      sourceDomainRules,
    ),
  );
}

function normalizeEndpointConfiguration<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (
      error instanceof ConfigurationValidationError &&
      (error.reason === 'widens_source_policy' ||
        error.reason === 'hostname_outside_effective_domain_policy' ||
        (error.field === 'domainRule.hostname' &&
          error.reason === 'invalid_dns_name'))
    ) {
      throw new EndpointAdministrationError('endpoint_domain_policy_conflict');
    }
    return normalizeAdminValue(() => {
      throw error;
    });
  }
}

async function requireCategory(
  executor: QueryExecutor,
  categoryConfigKey: string | undefined,
): Promise<void> {
  if (categoryConfigKey === undefined) return;
  if (
    (await findCategoryByConfigKey(executor, categoryConfigKey)) === undefined
  ) {
    throw new EndpointAdministrationError('category_not_found');
  }
}

async function loadSourceDomainRules(
  executor: QueryExecutor,
  sourceId: string,
): Promise<readonly DomainRule[]> {
  const result = await executor.query<DomainRuleRow>(
    `SELECT source_id AS owner_id, hostname, include_subdomains
     FROM source_approved_domain_rules
     WHERE source_id = $1
     ORDER BY hostname ASC`,
    [sourceId],
  );
  return mapDomainRules(result.rows);
}

async function loadEndpointDomainRules(
  executor: QueryExecutor,
  endpointId: string,
): Promise<readonly DomainRule[]> {
  const result = await executor.query<DomainRuleRow>(
    `SELECT source_endpoint_id AS owner_id, hostname, include_subdomains
     FROM source_endpoint_domain_rules
     WHERE source_endpoint_id = $1
     ORDER BY hostname ASC`,
    [endpointId],
  );
  return mapDomainRules(result.rows);
}

function mapDomainRules(rows: readonly DomainRuleRow[]): readonly DomainRule[] {
  return normalizeDomainRules(
    rows.map((row) => ({
      hostname: row.hostname,
      includeSubdomains: row.include_subdomains,
    })),
  );
}

function groupDomainRules(
  rows: readonly DomainRuleRow[],
): ReadonlyMap<string, readonly DomainRule[]> {
  const grouped = new Map<string, DomainRule[]>();
  for (const row of rows) {
    const ownerId = requiredString(row.owner_id);
    const values = grouped.get(ownerId) ?? [];
    values.push(...mapDomainRules([row]));
    grouped.set(ownerId, values);
  }
  return new Map(
    [...grouped].map(([key, values]) => [key, Object.freeze(values)]),
  );
}

async function replaceEndpointDomainRules(
  executor: QueryExecutor,
  endpointId: string,
  rules: readonly DomainRule[],
): Promise<void> {
  await executor.query(
    'DELETE FROM source_endpoint_domain_rules WHERE source_endpoint_id = $1',
    [endpointId],
  );
  for (const rule of rules) {
    await executor.query(
      `INSERT INTO source_endpoint_domain_rules (
         source_endpoint_id, hostname, include_subdomains
       ) VALUES ($1, $2, $3)`,
      [endpointId, rule.hostname, rule.includeSubdomains],
    );
  }
}

function normalizeDefaultCategoryKey(value: unknown): string | undefined {
  return value === null
    ? undefined
    : normalizeAdminValue(() => normalizeConfigKey(value));
}

function normalizedKey(value: unknown): string {
  return normalizeAdminValue(() => normalizeConfigKey(value));
}

function normalizeAdminValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EndpointAdministrationError) throw error;
    if (error instanceof ConfigurationValidationError) {
      throw new EndpointAdministrationError('invalid_request');
    }
    throw error;
  }
}

function exactRecord(
  input: unknown,
  requiredKeys: readonly string[],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EndpointAdministrationError('invalid_request');
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(requiredKeys);
  if (
    requiredKeys.some((key) => !(key in record)) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new EndpointAdministrationError('invalid_request');
  }
  return record;
}

function mapEndpointConstraintError(error: unknown): unknown {
  if (error instanceof EndpointAdministrationError) return error;
  if (typeof error !== 'object' || error === null) return error;
  if (Reflect.get(error, 'code') !== '23505') return error;
  const constraint = Reflect.get(error, 'constraint');
  if (constraint === 'source_endpoints_source_config_key_unique') {
    return new EndpointAdministrationError('endpoint_config_key_conflict');
  }
  if (constraint === 'source_endpoints_source_url_unique') {
    return new EndpointAdministrationError('endpoint_url_conflict');
  }
  return error;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error();
  return value;
}

function nullableString(value: unknown): string | undefined {
  return value === null ? undefined : requiredString(value);
}

function requiredDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('Endpoint administration clock returned invalid time');
  }
  return value;
}
