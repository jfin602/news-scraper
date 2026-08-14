import type { QueryResultRow } from 'pg';

import { type Database, type QueryExecutor } from '../database/database.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import {
  findCategoryByConfigKey,
  setSourceDefaultCategory,
} from '../collection/relevance/repository.ts';
import {
  effectiveEndpointDomainRules,
  hostMatchesDomainRule,
  normalizeApprovalState,
  normalizeConfigKey,
  normalizeDomainRules,
  normalizeLifecycleState,
  normalizeOperationalState,
  normalizeRssAtomAdmissionPhrases,
  normalizeSourceConfiguration,
  parseEndpointUrl,
  type ApprovalState,
  type DomainRule,
  type LifecycleState,
  type OperationalState,
} from '../sources/configuration.ts';
import { insertSource } from '../sources/repository.ts';

export const SOURCE_ADMINISTRATION_LIST_LIMIT = 500;

export type SourceAdministrationErrorCode =
  | 'category_not_found'
  | 'invalid_request'
  | 'source_archived'
  | 'source_config_key_conflict'
  | 'source_domain_policy_conflict'
  | 'source_not_found';

export class SourceAdministrationError extends Error {
  readonly code: SourceAdministrationErrorCode;

  constructor(code: SourceAdministrationErrorCode) {
    super(`Source administration command failed: ${code}`);
    this.name = 'SourceAdministrationError';
    this.code = code;
  }
}

export interface AdminCategoryChoice {
  readonly configKey: string;
  readonly displayName: string;
}

export interface AdminSourceReadModel {
  readonly configKey: string;
  readonly displayName: string;
  readonly siteUrl: string;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly priority: number;
  readonly approvedDomains: readonly DomainRule[];
  readonly defaultCategory: AdminCategoryChoice | null;
  readonly rssAtomAdmissionPhrases: readonly string[];
  readonly endpointCount: number;
}

export interface SourceAdministrationService {
  listSources(): Promise<readonly AdminSourceReadModel[]>;
  getSource(sourceConfigKey: unknown): Promise<AdminSourceReadModel>;
  createSource(input: unknown): Promise<AdminSourceReadModel>;
  replaceSourceConfiguration(
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminSourceReadModel>;
  setSourceApproval(
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminSourceReadModel>;
  setSourceOperationalState(
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminSourceReadModel>;
  setSourceLifecycle(
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminSourceReadModel>;
}

interface NormalizedMutableSourceConfiguration {
  readonly displayName: string;
  readonly siteUrl: string;
  readonly approvedDomains: readonly DomainRule[];
  readonly priority: number;
  readonly defaultCategoryConfigKey?: string;
  readonly rssAtomAdmissionPhrases: readonly string[];
}

interface NormalizedSourceCreate extends NormalizedMutableSourceConfiguration {
  readonly configKey: string;
  readonly approvalState: ApprovalState;
  readonly operationalState: OperationalState;
}

interface SourceReadRow extends QueryResultRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly display_name: unknown;
  readonly site_url: unknown;
  readonly approval_state: unknown;
  readonly lifecycle_state: unknown;
  readonly operational_state: unknown;
  readonly priority: unknown;
  readonly default_category_config_key: unknown;
  readonly default_category_display_name: unknown;
  readonly endpoint_count: unknown;
}

interface SourceIdRow extends QueryResultRow {
  readonly id: unknown;
}

interface EndpointPolicyRow extends QueryResultRow {
  readonly id: unknown;
  readonly endpoint_url: unknown;
  readonly approval_state: unknown;
}

interface DomainRuleRow extends QueryResultRow {
  readonly owner_id: unknown;
  readonly hostname: unknown;
  readonly include_subdomains: unknown;
}

interface AdmissionPhraseRow extends QueryResultRow {
  readonly source_id: unknown;
  readonly position: unknown;
  readonly phrase: unknown;
}

const MUTABLE_CONFIGURATION_KEYS = [
  'displayName',
  'siteUrl',
  'approvedDomains',
  'priority',
  'defaultCategoryConfigKey',
  'rssAtomAdmissionPhrases',
] as const;

export function createSourceAdministrationService(
  database: Database,
): SourceAdministrationService {
  return Object.freeze({
    async listSources() {
      return readSources(database);
    },

    async getSource(sourceConfigKey: unknown) {
      const key = normalizedSourceKey(sourceConfigKey);
      return requireSourceReadModel(database, key);
    },

    async createSource(input: unknown) {
      const command = normalizeSourceCreate(input);
      try {
        return await database.transaction(async (transaction) => {
          await requireCategory(transaction, command.defaultCategoryConfigKey);
          const source = await insertSource(transaction, {
            configKey: command.configKey,
            displayName: command.displayName,
            siteUrl: command.siteUrl,
            approvalState: command.approvalState,
            lifecycleState: 'active',
            operationalState: command.operationalState,
            domainRules: command.approvedDomains,
            priority: command.priority,
            ...(command.rssAtomAdmissionPhrases.length === 0
              ? {}
              : {
                  rssAtomAdmissionPhrases: command.rssAtomAdmissionPhrases,
                }),
          });
          await setSourceDefaultCategory(
            transaction,
            source.id,
            command.defaultCategoryConfigKey,
          );
          return requireSourceReadModel(transaction, command.configKey);
        });
      } catch (error) {
        if (isSourceConfigKeyConflict(error)) {
          throw new SourceAdministrationError('source_config_key_conflict');
        }
        throw error;
      }
    },

    async replaceSourceConfiguration(sourceConfigKey: unknown, input: unknown) {
      const key = normalizedSourceKey(sourceConfigKey);
      const command = normalizeMutableSourceConfiguration(input);
      return database.transaction(async (transaction) => {
        const sourceId = await lockSource(transaction, key);
        await requireCategory(transaction, command.defaultCategoryConfigKey);
        const endpoints = await lockSourceEndpoints(transaction, sourceId);
        const endpointRules = await lockEndpointDomainRules(
          transaction,
          sourceId,
        );
        validateRetainedEndpointPolicies(
          command.approvedDomains,
          endpoints,
          endpointRules,
        );

        await transaction.query(
          `UPDATE sources
           SET display_name = $2, site_url = $3, priority = $4,
               updated_at = now()
           WHERE id = $1`,
          [sourceId, command.displayName, command.siteUrl, command.priority],
        );
        await replaceSourceDomainRules(
          transaction,
          sourceId,
          command.approvedDomains,
        );
        await replaceAdmissionPhrases(
          transaction,
          sourceId,
          command.rssAtomAdmissionPhrases,
        );
        await setSourceDefaultCategory(
          transaction,
          sourceId,
          command.defaultCategoryConfigKey,
        );
        return requireSourceReadModel(transaction, key);
      });
    },

    async setSourceApproval(sourceConfigKey: unknown, input: unknown) {
      const key = normalizedSourceKey(sourceConfigKey);
      const command = exactRecord(input, ['approvalState']);
      const approvalState = normalizeAdminValue(() =>
        normalizeApprovalState(command.approvalState),
      );
      return updateLockedSourceState(database, key, async (transaction, id) => {
        await transaction.query(
          `UPDATE sources
           SET approval_state = $2, updated_at = now()
           WHERE id = $1`,
          [id, approvalState],
        );
      });
    },

    async setSourceOperationalState(sourceConfigKey: unknown, input: unknown) {
      const key = normalizedSourceKey(sourceConfigKey);
      const command = exactRecord(input, ['operationalState']);
      const operationalState = normalizeAdminValue(() =>
        normalizeOperationalState(command.operationalState),
      );
      return updateLockedSourceState(database, key, async (transaction, id) => {
        const state = await transaction.query<{
          readonly lifecycle_state: unknown;
        }>('SELECT lifecycle_state FROM sources WHERE id = $1', [id]);
        if (state.rows[0]?.lifecycle_state === 'archived') {
          throw new SourceAdministrationError('source_archived');
        }
        await transaction.query(
          `UPDATE sources
             SET operational_state = $2, updated_at = now()
             WHERE id = $1`,
          [id, operationalState],
        );
      });
    },

    async setSourceLifecycle(sourceConfigKey: unknown, input: unknown) {
      const key = normalizedSourceKey(sourceConfigKey);
      const command = exactRecord(input, ['lifecycleState']);
      const lifecycleState = normalizeAdminValue(() =>
        normalizeLifecycleState(command.lifecycleState),
      );
      return updateLockedSourceState(database, key, async (transaction, id) => {
        await transaction.query(
          `UPDATE sources
           SET lifecycle_state = $2, operational_state = 'disabled',
               updated_at = now()
           WHERE id = $1`,
          [id, lifecycleState],
        );
      });
    },
  });
}

async function updateLockedSourceState(
  database: Database,
  sourceConfigKey: string,
  update: (transaction: QueryExecutor, sourceId: string) => Promise<void>,
): Promise<AdminSourceReadModel> {
  return database.transaction(async (transaction) => {
    const sourceId = await lockSource(transaction, sourceConfigKey);
    await update(transaction, sourceId);
    return requireSourceReadModel(transaction, sourceConfigKey);
  });
}

// Administrative mutations lock in Source -> endpoint -> endpoint-policy order.
// P5 endpoint commands must reuse this order before locking an endpoint.
async function lockSource(
  executor: QueryExecutor,
  sourceConfigKey: string,
): Promise<string> {
  const result = await executor.query<SourceIdRow>(
    `SELECT id FROM sources WHERE config_key = $1 FOR UPDATE`,
    [sourceConfigKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new SourceAdministrationError('source_not_found');
  }
  return requiredString(row.id);
}

async function lockSourceEndpoints(
  executor: QueryExecutor,
  sourceId: string,
): Promise<readonly EndpointPolicyRow[]> {
  const result = await executor.query<EndpointPolicyRow>(
    `SELECT id, endpoint_url, approval_state
     FROM source_endpoints
     WHERE source_id = $1
     ORDER BY id ASC
     FOR UPDATE`,
    [sourceId],
  );
  return Object.freeze([...result.rows]);
}

async function lockEndpointDomainRules(
  executor: QueryExecutor,
  sourceId: string,
): Promise<ReadonlyMap<string, readonly DomainRule[]>> {
  const result = await executor.query<DomainRuleRow>(
    `SELECT rule.source_endpoint_id AS owner_id,
            rule.hostname, rule.include_subdomains
     FROM source_endpoint_domain_rules rule
     JOIN source_endpoints endpoint ON endpoint.id = rule.source_endpoint_id
     WHERE endpoint.source_id = $1
     ORDER BY rule.source_endpoint_id ASC, rule.hostname ASC
     FOR UPDATE OF rule`,
    [sourceId],
  );
  return groupDomainRules(result.rows);
}

function validateRetainedEndpointPolicies(
  sourceRules: readonly DomainRule[],
  endpoints: readonly EndpointPolicyRow[],
  endpointRulesById: ReadonlyMap<string, readonly DomainRule[]>,
): void {
  for (const endpoint of endpoints) {
    try {
      const endpointId = requiredString(endpoint.id);
      const endpointRules = endpointRulesById.get(endpointId) ?? [];
      const effectiveRules = effectiveEndpointDomainRules(
        sourceRules,
        endpointRules,
      );
      const approvalState = normalizeApprovalState(endpoint.approval_state);
      const endpointUrl = parseEndpointUrl(endpoint.endpoint_url);
      if (
        approvalState === 'approved' &&
        !effectiveRules.some((rule) =>
          hostMatchesDomainRule(endpointUrl.hostname, rule),
        )
      ) {
        throw new Error('approved endpoint host is outside proposed policy');
      }
    } catch {
      throw new SourceAdministrationError('source_domain_policy_conflict');
    }
  }
}

async function replaceSourceDomainRules(
  executor: QueryExecutor,
  sourceId: string,
  rules: readonly DomainRule[],
): Promise<void> {
  await executor.query(
    'DELETE FROM source_approved_domain_rules WHERE source_id = $1',
    [sourceId],
  );
  for (const rule of rules) {
    await executor.query(
      `INSERT INTO source_approved_domain_rules (
         source_id, hostname, include_subdomains
       ) VALUES ($1, $2, $3)`,
      [sourceId, rule.hostname, rule.includeSubdomains],
    );
  }
}

async function replaceAdmissionPhrases(
  executor: QueryExecutor,
  sourceId: string,
  phrases: readonly string[],
): Promise<void> {
  await executor.query(
    'DELETE FROM source_rss_atom_admission_phrases WHERE source_id = $1',
    [sourceId],
  );
  for (const [position, phrase] of phrases.entries()) {
    await executor.query(
      `INSERT INTO source_rss_atom_admission_phrases (
         source_id, position, phrase
       ) VALUES ($1, $2, $3)`,
      [sourceId, position, phrase],
    );
  }
}

async function requireCategory(
  executor: QueryExecutor,
  configKey: string | undefined,
): Promise<void> {
  if (configKey === undefined) return;
  if ((await findCategoryByConfigKey(executor, configKey)) === undefined) {
    throw new SourceAdministrationError('category_not_found');
  }
}

async function requireSourceReadModel(
  executor: QueryExecutor,
  configKey: string,
): Promise<AdminSourceReadModel> {
  const sources = await readSources(executor, configKey);
  const source = sources[0];
  if (source === undefined) {
    throw new SourceAdministrationError('source_not_found');
  }
  return source;
}

async function readSources(
  executor: QueryExecutor,
  configKey?: string,
): Promise<readonly AdminSourceReadModel[]> {
  const values: unknown[] = [];
  const predicate =
    configKey === undefined
      ? ''
      : `WHERE source.config_key = $${String(values.push(configKey))}`;
  const limit =
    configKey === undefined
      ? `LIMIT $${String(values.push(SOURCE_ADMINISTRATION_LIST_LIMIT))}`
      : '';
  const result = await executor.query<SourceReadRow>(
    `SELECT
       source.id, source.config_key, source.display_name, source.site_url,
       source.approval_state, source.lifecycle_state,
       source.operational_state, source.priority,
       category.config_key AS default_category_config_key,
       category.display_name AS default_category_display_name,
       count(endpoint.id)::integer AS endpoint_count
     FROM sources source
     LEFT JOIN categories category ON category.id = source.default_category_id
     LEFT JOIN source_endpoints endpoint ON endpoint.source_id = source.id
     ${predicate}
     GROUP BY source.id, category.config_key, category.display_name
     ORDER BY source.config_key ASC
     ${limit}`,
    values,
  );
  if (result.rows.length === 0) return Object.freeze([]);
  const sourceIds = result.rows.map((row) => requiredString(row.id));
  const [domainResult, phraseResult] = await Promise.all([
    executor.query<DomainRuleRow>(
      `SELECT source_id AS owner_id, hostname, include_subdomains
       FROM source_approved_domain_rules
       WHERE source_id = ANY($1::uuid[])
       ORDER BY source_id ASC, hostname ASC`,
      [sourceIds],
    ),
    executor.query<AdmissionPhraseRow>(
      `SELECT source_id, position, phrase
       FROM source_rss_atom_admission_phrases
       WHERE source_id = ANY($1::uuid[])
       ORDER BY source_id ASC, position ASC`,
      [sourceIds],
    ),
  ]);
  const domains = groupDomainRules(domainResult.rows);
  const phrases = groupAdmissionPhrases(phraseResult.rows);
  return Object.freeze(
    result.rows.map((row) =>
      mapSourceReadRow(
        row,
        domains.get(requiredString(row.id)) ?? [],
        phrases.get(requiredString(row.id)) ?? [],
      ),
    ),
  );
}

function mapSourceReadRow(
  row: SourceReadRow,
  approvedDomains: readonly DomainRule[],
  rssAtomAdmissionPhrases: readonly string[],
): AdminSourceReadModel {
  try {
    const categoryKey = nullableString(row.default_category_config_key);
    const categoryName = nullableString(row.default_category_display_name);
    if ((categoryKey === undefined) !== (categoryName === undefined)) {
      throw new Error('invalid category identity');
    }
    return Object.freeze({
      configKey: normalizeConfigKey(row.config_key),
      displayName: requiredString(row.display_name),
      siteUrl: requiredString(row.site_url),
      approvalState: normalizeApprovalState(row.approval_state),
      lifecycleState: normalizeLifecycleState(row.lifecycle_state),
      operationalState: normalizeOperationalState(row.operational_state),
      priority: requiredNonnegativeInteger(row.priority),
      approvedDomains: Object.freeze([...approvedDomains]),
      defaultCategory:
        categoryKey === undefined || categoryName === undefined
          ? null
          : Object.freeze({
              configKey: categoryKey,
              displayName: categoryName,
            }),
      rssAtomAdmissionPhrases: Object.freeze([...rssAtomAdmissionPhrases]),
      endpointCount: requiredNonnegativeInteger(row.endpoint_count),
    });
  } catch {
    throw new Error('Database returned invalid Source administration data');
  }
}

function groupDomainRules(
  rows: readonly DomainRuleRow[],
): ReadonlyMap<string, readonly DomainRule[]> {
  const grouped = new Map<string, DomainRule[]>();
  for (const row of rows) {
    const ownerId = requiredString(row.owner_id);
    const values = grouped.get(ownerId) ?? [];
    values.push(
      normalizeDomainRules([
        {
          hostname: row.hostname,
          includeSubdomains: row.include_subdomains,
        },
      ])[0] as DomainRule,
    );
    grouped.set(ownerId, values);
  }
  return new Map(
    [...grouped].map(([key, values]) => [key, Object.freeze(values)]),
  );
}

function groupAdmissionPhrases(
  rows: readonly AdmissionPhraseRow[],
): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const sourceId = requiredString(row.source_id);
    requiredNonnegativeInteger(row.position);
    const phrase = requiredString(row.phrase);
    const values = grouped.get(sourceId) ?? [];
    values.push(phrase);
    grouped.set(sourceId, values);
  }
  return new Map(
    [...grouped].map(([key, values]) => [key, Object.freeze(values)]),
  );
}

function normalizeSourceCreate(input: unknown): NormalizedSourceCreate {
  const record = exactRecord(input, [
    'configKey',
    ...MUTABLE_CONFIGURATION_KEYS,
    'approvalState',
    'operationalState',
  ]);
  const mutable = normalizeMutableSourceRecord(record);
  return Object.freeze({
    configKey: normalizeAdminValue(() => normalizeConfigKey(record.configKey)),
    ...mutable,
    approvalState: normalizeAdminValue(() =>
      normalizeApprovalState(record.approvalState),
    ),
    operationalState: normalizeAdminValue(() =>
      normalizeOperationalState(record.operationalState),
    ),
  });
}

function normalizeMutableSourceConfiguration(
  input: unknown,
): NormalizedMutableSourceConfiguration {
  return normalizeMutableSourceRecord(
    exactRecord(input, MUTABLE_CONFIGURATION_KEYS),
  );
}

function normalizeMutableSourceRecord(
  record: Record<string, unknown>,
): NormalizedMutableSourceConfiguration {
  return normalizeAdminValue(() => {
    const phrases = normalizeAdminPhraseList(record.rssAtomAdmissionPhrases);
    const source = normalizeSourceConfiguration({
      configKey: 'admin_validation',
      displayName: record.displayName,
      siteUrl: record.siteUrl,
      approvalState: 'unapproved',
      lifecycleState: 'active',
      operationalState: 'disabled',
      domainRules: record.approvedDomains,
      priority: record.priority,
      ...(phrases.length === 0 ? {} : { rssAtomAdmissionPhrases: phrases }),
    });
    const defaultCategoryConfigKey = normalizeDefaultCategoryKey(
      record.defaultCategoryConfigKey,
    );
    return Object.freeze({
      displayName: source.displayName,
      siteUrl: source.siteUrl.value,
      approvedDomains: source.domainRules,
      priority: source.priority,
      ...(defaultCategoryConfigKey === undefined
        ? {}
        : { defaultCategoryConfigKey }),
      rssAtomAdmissionPhrases: phrases,
    });
  });
}

function normalizeAdminPhraseList(value: unknown): readonly string[] {
  if (Array.isArray(value) && value.length === 0) return Object.freeze([]);
  return normalizeRssAtomAdmissionPhrases(value);
}

function normalizeDefaultCategoryKey(value: unknown): string | undefined {
  return value === null ? undefined : normalizeConfigKey(value);
}

function normalizedSourceKey(value: unknown): string {
  return normalizeAdminValue(() => normalizeConfigKey(value));
}

function normalizeAdminValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof SourceAdministrationError) throw error;
    if (error instanceof ConfigurationValidationError) {
      throw new SourceAdministrationError('invalid_request');
    }
    throw error;
  }
}

function exactRecord(
  input: unknown,
  requiredKeys: readonly string[],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SourceAdministrationError('invalid_request');
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(requiredKeys);
  if (
    requiredKeys.some((key) => !(key in record)) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new SourceAdministrationError('invalid_request');
  }
  return record;
}

function isSourceConfigKeyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (
    Reflect.get(error, 'code') === '23505' &&
    Reflect.get(error, 'constraint') === 'sources_config_key_unique'
  );
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error();
  return value;
}

function nullableString(value: unknown): string | undefined {
  return value === null ? undefined : requiredString(value);
}

function requiredNonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error();
  }
  return value;
}
