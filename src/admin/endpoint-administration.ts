import type { QueryResultRow } from 'pg';

import {
  findCategoryByConfigKey,
  setEndpointDefaultCategory,
} from '../collection/relevance/repository.ts';
import { type Database, type QueryExecutor } from '../database/database.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
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
import { insertSourceEndpoint } from '../sources/repository.ts';

export const ENDPOINT_ADMINISTRATION_LIST_LIMIT = 500;

export type EndpointAdministrationErrorCode =
  | 'category_not_found'
  | 'endpoint_archived'
  | 'endpoint_config_key_conflict'
  | 'endpoint_domain_policy_conflict'
  | 'endpoint_not_found'
  | 'endpoint_url_conflict'
  | 'invalid_request'
  | 'source_archived'
  | 'source_not_found';

export class EndpointAdministrationError extends Error {
  readonly code: EndpointAdministrationErrorCode;

  constructor(code: EndpointAdministrationErrorCode) {
    super(`Endpoint administration command failed: ${code}`);
    this.name = 'EndpointAdministrationError';
    this.code = code;
  }
}

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
}

interface SourceIdentityRow extends QueryResultRow {
  readonly id: unknown;
  readonly lifecycle_state: unknown;
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
  readonly lifecycleState: LifecycleState;
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
): EndpointAdministrationService {
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
    `SELECT id, lifecycle_state
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
    lifecycleState: normalizeLifecycleState(row.lifecycle_state),
    domainRules: await loadSourceDomainRules(executor, id),
  });
}

async function resolveSource(
  executor: QueryExecutor,
  sourceConfigKey: string,
): Promise<Pick<LockedSource, 'id' | 'lifecycleState'>> {
  const result = await executor.query<SourceIdentityRow>(
    `SELECT id, lifecycle_state
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
