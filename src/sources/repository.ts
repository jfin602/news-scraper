import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../database/database.ts';
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedSourceEndpoint {
  readonly id: string;
  readonly sourceId: string;
  readonly configKey: string;
  readonly endpointUrl: ParsedConfiguredUrl;
  readonly endpointType: EndpointType;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly pollIntervalSeconds: number;
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
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface EndpointRow {
  readonly id: unknown;
  readonly source_id: unknown;
  readonly config_key: unknown;
  readonly endpoint_url: unknown;
  readonly endpoint_type: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface DomainRuleRow {
  readonly hostname: unknown;
  readonly include_subdomains: unknown;
}

interface AggregateRow extends SourceRow {
  readonly publication_name: unknown;
  readonly publication_active_for_collection: unknown;
  readonly publication_public_status: unknown;
  readonly publication_created_at: unknown;
  readonly publication_updated_at: unknown;
  readonly endpoint_id: unknown;
  readonly endpoint_source_id: unknown;
  readonly endpoint_config_key: unknown;
  readonly endpoint_url: unknown;
  readonly endpoint_type: unknown;
  readonly endpoint_approval_state: unknown;
  readonly endpoint_lifecycle_state: unknown;
  readonly endpoint_operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly endpoint_created_at: unknown;
  readonly endpoint_updated_at: unknown;
}

const SOURCE_COLUMNS = `
  id, config_key, display_name, site_url,
  approval_state, lifecycle_state, operational_state, created_at, updated_at`;
const ENDPOINT_COLUMNS = `
  id, source_id, config_key, endpoint_url, endpoint_type,
  approval_state, lifecycle_state, operational_state, poll_interval_seconds,
  created_at, updated_at`;

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
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    ],
  );
  const inserted = sourceResult.rows[0];
  if (inserted !== undefined) {
    const value = mapSourceRow(inserted);
    await insertSourceDomainRules(executor, value.id, source.domainRules);
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
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SOURCE_COLUMNS}`,
    [
      randomUUID(),
      source.configKey,
      source.displayName,
      source.siteUrl.value,
      source.approvalState,
      source.lifecycleState,
      source.operationalState,
    ],
  );
  const persisted = mapSourceRow(
    requiredRow(sourceResult.rows, 'source insert'),
  );
  await insertSourceDomainRules(executor, persisted.id, source.domainRules);
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
  return row === undefined ? undefined : mapSourceRow(row);
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
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (source_id, config_key) DO NOTHING
     RETURNING ${ENDPOINT_COLUMNS}`,
    [
      randomUUID(),
      sourceId,
      endpoint.configKey,
      endpoint.endpointUrl.value,
      endpoint.endpointType,
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
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${ENDPOINT_COLUMNS}`,
    [
      randomUUID(),
      sourceId,
      endpoint.configKey,
      endpoint.endpointUrl.value,
      endpoint.endpointType,
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
  const result = await executor.query<AggregateRow>(
    `SELECT
       p.name AS publication_name,
       p.active_for_collection AS publication_active_for_collection,
       p.public_status AS publication_public_status,
       p.created_at AS publication_created_at,
       p.updated_at AS publication_updated_at,
       s.id AS id,
       s.config_key AS config_key,
       s.display_name AS display_name,
       s.site_url AS site_url,
       s.approval_state AS approval_state,
       s.lifecycle_state AS lifecycle_state,
       s.operational_state AS operational_state,
       s.created_at AS created_at,
       s.updated_at AS updated_at,
       e.id AS endpoint_id,
       e.source_id AS endpoint_source_id,
       e.config_key AS endpoint_config_key,
       e.endpoint_url AS endpoint_url,
       e.endpoint_type AS endpoint_type,
       e.approval_state AS endpoint_approval_state,
       e.lifecycle_state AS endpoint_lifecycle_state,
       e.operational_state AS endpoint_operational_state,
       e.poll_interval_seconds AS poll_interval_seconds,
       e.created_at AS endpoint_created_at,
       e.updated_at AS endpoint_updated_at
     FROM sources s
     JOIN source_endpoints e ON e.source_id = s.id
     CROSS JOIN publication_settings p
     WHERE s.config_key = $1 AND e.config_key = $2`,
    [sourceConfigKey, endpointConfigKey],
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
    approval_state: row.endpoint_approval_state,
    lifecycle_state: row.endpoint_lifecycle_state,
    operational_state: row.endpoint_operational_state,
    poll_interval_seconds: row.poll_interval_seconds,
    created_at: row.endpoint_created_at,
    updated_at: row.endpoint_updated_at,
  });
  const publication = mapPublicationSettingsRow({
    name: row.publication_name,
    active_for_collection: row.publication_active_for_collection,
    public_status: row.publication_public_status,
    created_at: row.publication_created_at,
    updated_at: row.publication_updated_at,
  });
  const [sourceDomainRules, endpointDomainRules] = await Promise.all([
    loadSourceApprovedDomainRules(executor, source.id),
    loadEndpointDomainRules(executor, endpoint.id),
  ]);
  return Object.freeze({
    publication,
    source,
    sourceDomainRules,
    endpoint,
    endpointDomainRules,
  });
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
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError('database returned invalid source');
  }
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
    return Object.freeze({
      id: requiredString(row.id),
      sourceId: requiredString(row.source_id),
      configKey: requiredString(row.config_key),
      endpointUrl: parseEndpointUrl(row.endpoint_url),
      endpointType: normalizeEndpointType(row.endpoint_type),
      approvalState: normalizeApprovalState(row.approval_state),
      lifecycleState: normalizeLifecycleState(row.lifecycle_state),
      operationalState: normalizeOperationalState(row.operational_state),
      pollIntervalSeconds,
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
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

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}
