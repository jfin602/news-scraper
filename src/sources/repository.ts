import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../database/database.ts';
import { HTTP_TRANSPORT_HEADER_LIMITS } from '../collection/fetchers/fetcher.ts';
import {
  normalizeHtmlListingProfile,
  type NormalizedHtmlListingProfile,
} from '../collection/parsers/html-listing-profile.ts';
import {
  ConfigurationPersistenceError,
  mapPublicationSettingsRow,
  requiredBoolean,
  requiredString,
  requiredTimestamp,
  type CreateIfAbsentResult,
  type PersistedPublicationSettings,
} from '../publication/repository.ts';
import {
  normalizeApprovalState,
  normalizeDomainRules,
  normalizeEndpointType,
  normalizeLifecycleState,
  normalizeOperationalState,
  normalizeSourceConfiguration,
  normalizeSourceEndpointConfigurationForSource,
  parseEndpointUrl,
  parseSourceSiteUrl,
  type ApprovalState,
  type DomainRule,
  type EndpointType,
  type LifecycleState,
  type OperationalState,
  type ParsedConfiguredUrl,
  type SourceConfiguration,
  type SourceEndpointConfiguration,
} from './configuration.ts';

export interface PersistedSource {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
  readonly siteUrl: ParsedConfiguredUrl;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly priority: number;
  readonly rssAtomAdmissionPhrases: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedSourceEndpoint {
  readonly id: string;
  readonly sourceId: string;
  readonly configKey: string;
  readonly endpointUrl: ParsedConfiguredUrl;
  readonly endpointType: EndpointType;
  readonly htmlListingProfile?: NormalizedHtmlListingProfile | undefined;
  readonly htmlListingProfileRevision?: number | undefined;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly pollIntervalSeconds: number;
  readonly nextDueAt?: Date | undefined;
  readonly lastAttemptAt?: Date | undefined;
  readonly lastSuccessAt?: Date | undefined;
  readonly lastFailureAt?: Date | undefined;
  readonly consecutiveFailureCount?: number | undefined;
  readonly cooldownUntil?: Date | undefined;
  readonly etag?: string | undefined;
  readonly lastModified?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EndpointConfigurationAggregate {
  readonly publication: PersistedPublicationSettings;
  readonly source: PersistedSource;
  readonly sourceDomainRules: readonly DomainRule[];
  readonly endpoint: PersistedSourceEndpoint;
  readonly endpointDomainRules: readonly DomainRule[];
}

interface SourceRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly display_name: unknown;
  readonly site_url: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
  readonly priority: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface EndpointRow {
  readonly id: unknown;
  readonly source_id: unknown;
  readonly config_key: unknown;
  readonly endpoint_url: unknown;
  readonly endpoint_type: unknown;
  readonly html_listing_profile: unknown;
  readonly html_listing_profile_revision: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly next_due_at: unknown;
  readonly last_attempt_at: unknown;
  readonly last_success_at: unknown;
  readonly last_failure_at: unknown;
  readonly consecutive_failure_count: unknown;
  readonly cooldown_until: unknown;
  readonly etag: unknown;
  readonly last_modified: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface DomainRuleRow {
  readonly hostname: unknown;
  readonly include_subdomains: unknown;
}

interface AdmissionPhraseRow {
  readonly position: unknown;
  readonly phrase: unknown;
}

interface AggregateRow extends SourceRow {
  readonly publication_name: unknown;
  readonly publication_active_for_collection: unknown;
  readonly publication_public_status: unknown;
  readonly publication_description: unknown;
  readonly publication_logo_path: unknown;
  readonly publication_accent_color: unknown;
  readonly publication_presentation_timezone: unknown;
  readonly publication_created_at: unknown;
  readonly publication_updated_at: unknown;
  readonly endpoint_id: unknown;
  readonly endpoint_source_id: unknown;
  readonly endpoint_config_key: unknown;
  readonly endpoint_url: unknown;
  readonly endpoint_type: unknown;
  readonly html_listing_profile: unknown;
  readonly html_listing_profile_revision: unknown;
  readonly endpoint_approval_state: unknown;
  readonly endpoint_lifecycle_state: unknown;
  readonly endpoint_operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly next_due_at: unknown;
  readonly last_attempt_at: unknown;
  readonly last_success_at: unknown;
  readonly last_failure_at: unknown;
  readonly consecutive_failure_count: unknown;
  readonly cooldown_until: unknown;
  readonly etag: unknown;
  readonly last_modified: unknown;
  readonly endpoint_created_at: unknown;
  readonly endpoint_updated_at: unknown;
}

const SOURCE_COLUMNS = `
  id, config_key, display_name, site_url,
  approval_state, lifecycle_state, operational_state, priority, created_at, updated_at`;
const ENDPOINT_COLUMNS = `
  id, source_id, config_key, endpoint_url, endpoint_type,
  html_listing_profile, html_listing_profile_revision,
  approval_state, lifecycle_state, operational_state, poll_interval_seconds,
  next_due_at, last_attempt_at, last_success_at, last_failure_at,
  consecutive_failure_count, cooldown_until, etag, last_modified,
  created_at, updated_at`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface EndpointConditionalValidators {
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface EndpointRuntimeStateUpdate {
  readonly completion?: Readonly<{
    readonly at: Date;
    readonly outcome: 'attempted' | 'succeeded' | 'failed';
  }>;
  readonly consecutiveFailureCount?: number;
  readonly nextDueAt?: Date | null;
  readonly cooldownUntil?: Date | null;
  readonly validators?: Readonly<{
    readonly mode: 'replace' | 'merge';
    readonly values: EndpointConditionalValidators;
  }>;
}

export async function insertSource(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedSource> {
  return insertValidatedSource(executor, normalizeSourceConfiguration(input));
}

export async function createSourceIfAbsent(
  executor: QueryExecutor,
  input: unknown,
): Promise<CreateIfAbsentResult<PersistedSource>> {
  const source = normalizeSourceConfiguration(input);
  const sourceResult = await executor.query<SourceRow>(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state, priority
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (config_key) DO NOTHING
     RETURNING ${SOURCE_COLUMNS}`,
    [
      randomUUID(),
      source.configKey,
      source.displayName,
      source.siteUrl.value,
      source.approvalState,
      source.lifecycleState,
      source.operationalState,
      source.priority,
    ],
  );
  const inserted = sourceResult.rows[0];
  if (inserted !== undefined) {
    const value = withAdmissionPhrases(
      mapSourceRow(inserted),
      source.rssAtomAdmissionPhrases,
    );
    await insertSourceDomainRules(executor, value.id, source.domainRules);
    await insertSourceRssAtomAdmissionPhrases(
      executor,
      value.id,
      source.rssAtomAdmissionPhrases,
    );
    return Object.freeze({ value, created: true });
  }
  const existing = await findSourceByConfigKey(executor, source.configKey);
  if (existing === undefined) {
    throw new ConfigurationPersistenceError('source conflict lookup');
  }
  return Object.freeze({ value: existing, created: false });
}

async function insertValidatedSource(
  executor: QueryExecutor,
  source: Readonly<SourceConfiguration>,
): Promise<PersistedSource> {
  const sourceResult = await executor.query<SourceRow>(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state, priority
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SOURCE_COLUMNS}`,
    [
      randomUUID(),
      source.configKey,
      source.displayName,
      source.siteUrl.value,
      source.approvalState,
      source.lifecycleState,
      source.operationalState,
      source.priority,
    ],
  );
  const persisted = withAdmissionPhrases(
    mapSourceRow(requiredRow(sourceResult.rows, 'source insert')),
    source.rssAtomAdmissionPhrases,
  );
  await insertSourceDomainRules(executor, persisted.id, source.domainRules);
  await insertSourceRssAtomAdmissionPhrases(
    executor,
    persisted.id,
    source.rssAtomAdmissionPhrases,
  );
  return persisted;
}

export async function findSourceByConfigKey(
  executor: QueryExecutor,
  configKey: string,
): Promise<PersistedSource | undefined> {
  const result = await executor.query<SourceRow>(
    `SELECT ${SOURCE_COLUMNS}
     FROM sources
     WHERE config_key = $1`,
    [configKey],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const source = mapSourceRow(row);
  return withAdmissionPhrases(
    source,
    await loadSourceRssAtomAdmissionPhrases(executor, source.id),
  );
}

export async function loadSourceApprovedDomainRules(
  executor: QueryExecutor,
  sourceId: string,
): Promise<readonly DomainRule[]> {
  const result = await executor.query<DomainRuleRow>(
    `SELECT hostname, include_subdomains
     FROM source_approved_domain_rules
     WHERE source_id = $1
     ORDER BY hostname ASC, include_subdomains ASC`,
    [sourceId],
  );
  return mapDomainRules(result.rows);
}

export async function loadSourceRssAtomAdmissionPhrases(
  executor: QueryExecutor,
  sourceId: string,
): Promise<readonly string[]> {
  const result = await executor.query<AdmissionPhraseRow>(
    `SELECT position, phrase
     FROM source_rss_atom_admission_phrases
     WHERE source_id = $1
     ORDER BY position ASC`,
    [sourceId],
  );
  return mapAdmissionPhrases(result.rows);
}

export async function insertSourceEndpoint(
  executor: QueryExecutor,
  sourceId: string,
  input: unknown,
): Promise<PersistedSourceEndpoint> {
  const sourceDomainRules = await loadSourceApprovedDomainRules(
    executor,
    sourceId,
  );
  return insertValidatedSourceEndpoint(
    executor,
    sourceId,
    normalizeSourceEndpointConfigurationForSource(input, sourceDomainRules),
  );
}

export async function createSourceEndpointIfAbsent(
  executor: QueryExecutor,
  sourceId: string,
  input: unknown,
): Promise<CreateIfAbsentResult<PersistedSourceEndpoint>> {
  const sourceDomainRules = await loadSourceApprovedDomainRules(
    executor,
    sourceId,
  );
  const endpoint = normalizeSourceEndpointConfigurationForSource(
    input,
    sourceDomainRules,
  );
  const endpointResult = await executor.query<EndpointRow>(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       html_listing_profile, html_listing_profile_revision,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (source_id, config_key) DO NOTHING
     RETURNING ${ENDPOINT_COLUMNS}`,
    [
      randomUUID(),
      sourceId,
      endpoint.configKey,
      endpoint.endpointUrl.value,
      endpoint.endpointType,
      endpoint.endpointType === 'html_listing'
        ? JSON.stringify(endpoint.htmlListingProfile)
        : null,
      endpoint.endpointType === 'html_listing' ? 1 : null,
      endpoint.approvalState,
      endpoint.lifecycleState,
      endpoint.operationalState,
      endpoint.pollIntervalSeconds,
    ],
  );
  const inserted = endpointResult.rows[0];
  if (inserted !== undefined) {
    const value = mapEndpointRow(inserted);
    await insertEndpointDomainRules(
      executor,
      value.id,
      endpoint.endpointDomainRules,
    );
    return Object.freeze({ value, created: true });
  }
  const existing = await findSourceEndpointBySourceAndConfigKey(
    executor,
    sourceId,
    endpoint.configKey,
  );
  if (existing === undefined) {
    throw new ConfigurationPersistenceError('endpoint conflict lookup');
  }
  return Object.freeze({ value: existing, created: false });
}

async function insertValidatedSourceEndpoint(
  executor: QueryExecutor,
  sourceId: string,
  endpoint: Readonly<SourceEndpointConfiguration>,
): Promise<PersistedSourceEndpoint> {
  const endpointResult = await executor.query<EndpointRow>(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       html_listing_profile, html_listing_profile_revision,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${ENDPOINT_COLUMNS}`,
    [
      randomUUID(),
      sourceId,
      endpoint.configKey,
      endpoint.endpointUrl.value,
      endpoint.endpointType,
      endpoint.endpointType === 'html_listing'
        ? JSON.stringify(endpoint.htmlListingProfile)
        : null,
      endpoint.endpointType === 'html_listing' ? 1 : null,
      endpoint.approvalState,
      endpoint.lifecycleState,
      endpoint.operationalState,
      endpoint.pollIntervalSeconds,
    ],
  );
  const persisted = mapEndpointRow(
    requiredRow(endpointResult.rows, 'endpoint insert'),
  );
  await insertEndpointDomainRules(
    executor,
    persisted.id,
    endpoint.endpointDomainRules,
  );
  return persisted;
}

export async function findSourceEndpointBySourceAndConfigKey(
  executor: QueryExecutor,
  sourceId: string,
  configKey: string,
): Promise<PersistedSourceEndpoint | undefined> {
  const result = await executor.query<EndpointRow>(
    `SELECT ${ENDPOINT_COLUMNS}
     FROM source_endpoints
     WHERE source_id = $1 AND config_key = $2`,
    [sourceId, configKey],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapEndpointRow(row);
}

export async function updateEndpointRuntimeState(
  executor: QueryExecutor,
  sourceEndpointId: string,
  input: EndpointRuntimeStateUpdate,
): Promise<PersistedSourceEndpoint> {
  const endpointId = requiredUuid(sourceEndpointId, 'source endpoint id');
  const update = validateEndpointRuntimeStateUpdate(input);
  const assignments: string[] = [];
  const values: unknown[] = [];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (update.completion !== undefined) {
    const completedAt = parameter(update.completion.at);
    assignments.push(`last_attempt_at = ${completedAt}`);
    if (update.completion.outcome === 'succeeded') {
      assignments.push(`last_success_at = ${completedAt}`);
    }
    if (update.completion.outcome === 'failed') {
      assignments.push(`last_failure_at = ${completedAt}`);
    }
  }
  if (update.consecutiveFailureCount !== undefined) {
    assignments.push(
      `consecutive_failure_count = ${parameter(update.consecutiveFailureCount)}`,
    );
  }
  if ('nextDueAt' in update) {
    assignments.push(`next_due_at = ${parameter(update.nextDueAt)}`);
  }
  if ('cooldownUntil' in update) {
    assignments.push(`cooldown_until = ${parameter(update.cooldownUntil)}`);
  }
  if (update.validators !== undefined) {
    const etag = parameter(update.validators.values.etag ?? null);
    const lastModified = parameter(
      update.validators.values.lastModified ?? null,
    );
    if (update.validators.mode === 'replace') {
      assignments.push(`etag = ${etag}`, `last_modified = ${lastModified}`);
    } else {
      assignments.push(
        `etag = COALESCE(${etag}, etag)`,
        `last_modified = COALESCE(${lastModified}, last_modified)`,
      );
    }
  }

  const result = await executor.query<EndpointRow>(
    `UPDATE source_endpoints
     SET ${assignments.join(', ')}
     WHERE id = ${parameter(endpointId)}
     RETURNING ${ENDPOINT_COLUMNS}`,
    values,
  );
  return mapEndpointRow(requiredRow(result.rows, 'endpoint runtime update'));
}

export async function loadEndpointDomainRules(
  executor: QueryExecutor,
  endpointId: string,
): Promise<readonly DomainRule[]> {
  const result = await executor.query<DomainRuleRow>(
    `SELECT hostname, include_subdomains
     FROM source_endpoint_domain_rules
     WHERE source_endpoint_id = $1
     ORDER BY hostname ASC, include_subdomains ASC`,
    [endpointId],
  );
  return mapDomainRules(result.rows);
}

export async function findEndpointConfigurationByKeys(
  executor: QueryExecutor,
  sourceConfigKey: string,
  endpointConfigKey: string,
): Promise<EndpointConfigurationAggregate | undefined> {
  return findEndpointConfiguration(
    executor,
    's.config_key = $1 AND e.config_key = $2',
    [sourceConfigKey, endpointConfigKey],
  );
}

export async function findEndpointConfigurationById(
  executor: QueryExecutor,
  sourceEndpointId: string,
): Promise<EndpointConfigurationAggregate | undefined> {
  const endpointId = requiredUuid(sourceEndpointId, 'source endpoint id');
  return findEndpointConfiguration(executor, 'e.id = $1', [endpointId]);
}

async function findEndpointConfiguration(
  executor: QueryExecutor,
  predicate: 's.config_key = $1 AND e.config_key = $2' | 'e.id = $1',
  values: readonly string[],
): Promise<EndpointConfigurationAggregate | undefined> {
  const result = await executor.query<AggregateRow>(
    `SELECT
       p.name AS publication_name,
       p.active_for_collection AS publication_active_for_collection,
       p.public_status AS publication_public_status,
       p.description AS publication_description,
       p.logo_path AS publication_logo_path,
       p.accent_color AS publication_accent_color,
       p.presentation_timezone AS publication_presentation_timezone,
       p.created_at AS publication_created_at,
       p.updated_at AS publication_updated_at,
       s.id AS id,
       s.config_key AS config_key,
       s.display_name AS display_name,
       s.site_url AS site_url,
       s.approval_state AS approval_state,
       s.lifecycle_state AS lifecycle_state,
       s.operational_state AS operational_state,
       s.priority AS priority,
       s.created_at AS created_at,
       s.updated_at AS updated_at,
       e.id AS endpoint_id,
       e.source_id AS endpoint_source_id,
       e.config_key AS endpoint_config_key,
       e.endpoint_url AS endpoint_url,
       e.endpoint_type AS endpoint_type,
       e.html_listing_profile AS html_listing_profile,
       e.html_listing_profile_revision AS html_listing_profile_revision,
       e.approval_state AS endpoint_approval_state,
       e.lifecycle_state AS endpoint_lifecycle_state,
       e.operational_state AS endpoint_operational_state,
       e.poll_interval_seconds AS poll_interval_seconds,
       e.next_due_at AS next_due_at,
       e.last_attempt_at AS last_attempt_at,
       e.last_success_at AS last_success_at,
       e.last_failure_at AS last_failure_at,
       e.consecutive_failure_count AS consecutive_failure_count,
       e.cooldown_until AS cooldown_until,
       e.etag AS etag,
       e.last_modified AS last_modified,
       e.created_at AS endpoint_created_at,
       e.updated_at AS endpoint_updated_at
     FROM sources s
     JOIN source_endpoints e ON e.source_id = s.id
     CROSS JOIN publication_settings p
     WHERE ${predicate}`,
    values,
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;

  const source = mapSourceRow(row);
  const endpoint = mapEndpointRow({
    id: row.endpoint_id,
    source_id: row.endpoint_source_id,
    config_key: row.endpoint_config_key,
    endpoint_url: row.endpoint_url,
    endpoint_type: row.endpoint_type,
    html_listing_profile: row.html_listing_profile,
    html_listing_profile_revision: row.html_listing_profile_revision,
    approval_state: row.endpoint_approval_state,
    lifecycle_state: row.endpoint_lifecycle_state,
    operational_state: row.endpoint_operational_state,
    poll_interval_seconds: row.poll_interval_seconds,
    next_due_at: row.next_due_at,
    last_attempt_at: row.last_attempt_at,
    last_success_at: row.last_success_at,
    last_failure_at: row.last_failure_at,
    consecutive_failure_count: row.consecutive_failure_count,
    cooldown_until: row.cooldown_until,
    etag: row.etag,
    last_modified: row.last_modified,
    created_at: row.endpoint_created_at,
    updated_at: row.endpoint_updated_at,
  });
  const publication = mapPublicationSettingsRow({
    name: row.publication_name,
    active_for_collection: row.publication_active_for_collection,
    public_status: row.publication_public_status,
    description: row.publication_description,
    logo_path: row.publication_logo_path,
    accent_color: row.publication_accent_color,
    presentation_timezone: row.publication_presentation_timezone,
    created_at: row.publication_created_at,
    updated_at: row.publication_updated_at,
  });
  const [
    sourceDomainRules,
    sourceRssAtomAdmissionPhrases,
    endpointDomainRules,
  ] = await Promise.all([
    loadSourceApprovedDomainRules(executor, source.id),
    loadSourceRssAtomAdmissionPhrases(executor, source.id),
    loadEndpointDomainRules(executor, endpoint.id),
  ]);
  return Object.freeze({
    publication,
    source: withAdmissionPhrases(source, sourceRssAtomAdmissionPhrases),
    sourceDomainRules,
    endpoint,
    endpointDomainRules,
  });
}

export async function applyTerminalCollectionRunToEndpointRuntime(
  executor: QueryExecutor,
  collectionRunId: string,
): Promise<PersistedSourceEndpoint | undefined> {
  const runId = requiredUuid(collectionRunId, 'collection run id');
  const result = await executor.query<EndpointRow>(
    `WITH target_run AS (
       SELECT run.id, run.source_endpoint_id, run.finished_at, run.run_status,
              run.transport_status, run.response_etag,
              run.response_last_modified,
              (
                SELECT count(*)::integer
                FROM collection_runs history
                WHERE history.source_endpoint_id = run.source_endpoint_id
                  AND history.run_status = 'failed'
                  AND history.finished_at <= run.finished_at
                  AND history.finished_at > COALESCE(
                    (
                      SELECT max(success.finished_at)
                      FROM collection_runs success
                      WHERE success.source_endpoint_id = run.source_endpoint_id
                        AND success.run_status = 'succeeded'
                        AND success.finished_at <= run.finished_at
                    ),
                    '-infinity'::timestamptz
                  )
              ) AS consecutive_failure_count
       FROM collection_runs run
       WHERE run.id = $1
         AND run.run_status IN ('succeeded', 'failed')
         AND run.finished_at IS NOT NULL
     )
     UPDATE source_endpoints endpoint
     SET last_attempt_at = target.finished_at,
         last_success_at = CASE
           WHEN target.run_status = 'succeeded' THEN target.finished_at
           ELSE endpoint.last_success_at
         END,
         last_failure_at = CASE
           WHEN target.run_status = 'failed' THEN target.finished_at
           ELSE endpoint.last_failure_at
         END,
         consecutive_failure_count = CASE
           WHEN target.run_status = 'succeeded' THEN 0
           ELSE target.consecutive_failure_count
         END,
         cooldown_until = NULL,
         next_due_at = target.finished_at
           + make_interval(secs => endpoint.poll_interval_seconds),
         etag = CASE
           WHEN target.run_status <> 'succeeded' THEN endpoint.etag
           WHEN target.transport_status = 'not_modified'
             THEN COALESCE(target.response_etag, endpoint.etag)
           ELSE target.response_etag
         END,
         last_modified = CASE
           WHEN target.run_status <> 'succeeded' THEN endpoint.last_modified
           WHEN target.transport_status = 'not_modified'
             THEN COALESCE(target.response_last_modified, endpoint.last_modified)
           ELSE target.response_last_modified
         END,
         updated_at = GREATEST(endpoint.updated_at, target.finished_at)
     FROM target_run target
     WHERE endpoint.id = target.source_endpoint_id
       AND (
         endpoint.last_attempt_at IS NULL
         OR endpoint.last_attempt_at <= target.finished_at
       )
     RETURNING ${qualifiedColumns(ENDPOINT_COLUMNS, 'endpoint')}`,
    [runId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapEndpointRow(row);
}

export async function applyCooldownFromFinalCollectionFailure(
  executor: QueryExecutor,
  collectionRunId: string,
  minimumCooldownSeconds: number,
  failureThreshold: number,
): Promise<PersistedSourceEndpoint | undefined> {
  const runId = requiredUuid(collectionRunId, 'collection run id');
  const minimumSeconds = requiredPositiveInteger(
    minimumCooldownSeconds,
    'minimum cooldown seconds',
  );
  const threshold = requiredPositiveInteger(
    failureThreshold,
    'cooldown failure threshold',
  );
  const result = await executor.query<EndpointRow>(
    `WITH target_run AS (
       SELECT source_endpoint_id, finished_at
       FROM collection_runs
       WHERE id = $1
         AND run_status = 'failed'
         AND finished_at IS NOT NULL
     )
     UPDATE source_endpoints endpoint
     SET cooldown_until = target.finished_at + make_interval(
           secs => GREATEST(endpoint.poll_interval_seconds, $2)
         ),
         updated_at = GREATEST(endpoint.updated_at, target.finished_at)
     FROM target_run target
     WHERE endpoint.id = target.source_endpoint_id
       AND endpoint.last_attempt_at = target.finished_at
       AND endpoint.consecutive_failure_count >= $3
     RETURNING ${qualifiedColumns(ENDPOINT_COLUMNS, 'endpoint')}`,
    [runId, minimumSeconds, threshold],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapEndpointRow(row);
}

export function mapSourceRow(row: SourceRow): PersistedSource {
  try {
    return Object.freeze({
      id: requiredString(row.id),
      configKey: requiredString(row.config_key),
      displayName: requiredString(row.display_name),
      siteUrl: parseSourceSiteUrl(row.site_url),
      approvalState: normalizeApprovalState(row.approval_state),
      lifecycleState: normalizeLifecycleState(row.lifecycle_state),
      operationalState: normalizeOperationalState(row.operational_state),
      priority: requiredNonnegativeInteger(row.priority),
      rssAtomAdmissionPhrases: Object.freeze([]),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError('database returned invalid source');
  }
}

function withAdmissionPhrases(
  source: PersistedSource,
  phrases: readonly string[],
): PersistedSource {
  return Object.freeze({
    ...source,
    rssAtomAdmissionPhrases: Object.freeze([...phrases]),
  });
}

export function mapEndpointRow(row: EndpointRow): PersistedSourceEndpoint {
  try {
    const pollIntervalSeconds = row.poll_interval_seconds;
    if (
      typeof pollIntervalSeconds !== 'number' ||
      !Number.isInteger(pollIntervalSeconds)
    ) {
      throw new Error();
    }
    const endpointType = normalizeEndpointType(row.endpoint_type);
    const common = {
      id: requiredString(row.id),
      sourceId: requiredString(row.source_id),
      configKey: requiredString(row.config_key),
      endpointUrl: parseEndpointUrl(row.endpoint_url),
      endpointType,
      approvalState: normalizeApprovalState(row.approval_state),
      lifecycleState: normalizeLifecycleState(row.lifecycle_state),
      operationalState: normalizeOperationalState(row.operational_state),
      pollIntervalSeconds,
      nextDueAt: nullableTimestamp(row.next_due_at),
      lastAttemptAt: nullableTimestamp(row.last_attempt_at),
      lastSuccessAt: nullableTimestamp(row.last_success_at),
      lastFailureAt: nullableTimestamp(row.last_failure_at),
      consecutiveFailureCount: requiredNonnegativeInteger(
        row.consecutive_failure_count,
      ),
      cooldownUntil: nullableTimestamp(row.cooldown_until),
      etag: nullableValidator(row.etag, 'etag'),
      lastModified: nullableValidator(row.last_modified, 'last modified'),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    };
    if (endpointType === 'rss_atom') {
      if (
        row.html_listing_profile !== null ||
        row.html_listing_profile_revision !== null
      )
        throw new Error();
      return Object.freeze(common);
    }
    if (
      row.html_listing_profile === null ||
      row.html_listing_profile_revision === null
    )
      throw new Error();
    const revision = requiredPositiveInteger(
      row.html_listing_profile_revision,
      'database HTML listing profile revision',
    );
    return Object.freeze({
      ...common,
      htmlListingProfile: normalizeHtmlListingProfile(row.html_listing_profile),
      htmlListingProfileRevision: revision,
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid endpoint',
    );
  }
}

async function insertSourceDomainRules(
  executor: QueryExecutor,
  sourceId: string,
  rules: readonly DomainRule[],
): Promise<void> {
  for (const rule of rules) {
    await executor.query(
      `INSERT INTO source_approved_domain_rules (
         source_id, hostname, include_subdomains
       ) VALUES ($1, $2, $3)`,
      [sourceId, rule.hostname, rule.includeSubdomains],
    );
  }
}

async function insertSourceRssAtomAdmissionPhrases(
  executor: QueryExecutor,
  sourceId: string,
  phrases: readonly string[],
): Promise<void> {
  for (const [position, phrase] of phrases.entries()) {
    await executor.query(
      `INSERT INTO source_rss_atom_admission_phrases (
         source_id, position, phrase
       ) VALUES ($1, $2, $3)`,
      [sourceId, position, phrase],
    );
  }
}

async function insertEndpointDomainRules(
  executor: QueryExecutor,
  endpointId: string,
  rules: readonly DomainRule[],
): Promise<void> {
  for (const rule of rules) {
    await executor.query(
      `INSERT INTO source_endpoint_domain_rules (
         source_endpoint_id, hostname, include_subdomains
       ) VALUES ($1, $2, $3)`,
      [endpointId, rule.hostname, rule.includeSubdomains],
    );
  }
}

function mapDomainRules(rows: readonly DomainRuleRow[]): readonly DomainRule[] {
  try {
    return normalizeDomainRules(
      rows.map((row) => ({
        hostname: requiredString(row.hostname),
        includeSubdomains: requiredBoolean(row.include_subdomains),
      })),
    );
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid domain rule',
    );
  }
}

function mapAdmissionPhrases(
  rows: readonly AdmissionPhraseRow[],
): readonly string[] {
  try {
    const phrases = rows.map((row, position) => {
      if (requiredNonnegativeInteger(row.position) !== position)
        throw new Error();
      const phrase = requiredString(row.phrase);
      if (
        phrase !== phrase.trim() ||
        phrase.length > 512 ||
        /\p{Cc}/u.test(phrase)
      ) {
        throw new Error();
      }
      return phrase;
    });
    return Object.freeze(phrases);
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid Source RSS/Atom admission phrase',
    );
  }
}

function validateEndpointRuntimeStateUpdate(
  input: EndpointRuntimeStateUpdate,
): EndpointRuntimeStateUpdate {
  if (input === null || typeof input !== 'object') {
    throw new ConfigurationPersistenceError('invalid endpoint runtime update');
  }
  try {
    const completion = input.completion;
    if (completion !== undefined) {
      if (
        completion === null ||
        typeof completion !== 'object' ||
        (completion.outcome !== 'attempted' &&
          completion.outcome !== 'succeeded' &&
          completion.outcome !== 'failed')
      ) {
        throw new Error();
      }
      requiredTimestamp(completion.at);
    }
    if (input.consecutiveFailureCount !== undefined) {
      requiredNonnegativeInteger(input.consecutiveFailureCount);
    }
    if ('nextDueAt' in input) nullableTimestamp(input.nextDueAt);
    if ('cooldownUntil' in input) nullableTimestamp(input.cooldownUntil);
    if (input.validators !== undefined) {
      const validators = input.validators;
      if (
        validators === null ||
        typeof validators !== 'object' ||
        (validators.mode !== 'replace' && validators.mode !== 'merge') ||
        validators.values === null ||
        typeof validators.values !== 'object'
      ) {
        throw new Error();
      }
      if (validators.values.etag !== undefined) {
        requiredValidator(validators.values.etag, 'etag');
      }
      if (validators.values.lastModified !== undefined) {
        requiredValidator(validators.values.lastModified, 'last modified');
      }
    }
    if (
      completion === undefined &&
      input.consecutiveFailureCount === undefined &&
      !('nextDueAt' in input) &&
      !('cooldownUntil' in input) &&
      input.validators === undefined
    ) {
      throw new Error();
    }
    return input;
  } catch {
    throw new ConfigurationPersistenceError('invalid endpoint runtime update');
  }
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ConfigurationPersistenceError(`invalid ${field}`);
  }
  return value;
}

function requiredNonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error();
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConfigurationPersistenceError(`invalid ${field}`);
  }
  return value as number;
}

function nullableTimestamp(value: unknown): Date | undefined {
  return value === null ? undefined : requiredTimestamp(value);
}

function requiredValidator(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > HTTP_TRANSPORT_HEADER_LIMITS.responseValidator ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function nullableValidator(value: unknown, field: string): string | undefined {
  return value === null ? undefined : requiredValidator(value, field);
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}

function qualifiedColumns(columns: string, alias: string): string {
  return columns
    .split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');
}
