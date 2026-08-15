import type { Database } from '../database/database.ts';
import {
  normalizeSourceConfiguration,
  normalizeSourceEndpointConfigurationForSource,
  type SourceConfiguration,
  type SourceEndpointConfiguration,
} from '../sources/configuration.ts';
import {
  createSourceEndpointIfAbsent,
  createSourceIfAbsent,
  findSourceEndpointBySourceAndConfigKey,
  loadSourceApprovedDomainRules,
} from '../sources/repository.ts';
import {
  normalizePublicationConfiguration,
  type PublicationConfiguration,
} from './configuration.ts';
import { createPublicationSettingsIfAbsent } from './repository.ts';

export interface BootstrapSourceConfiguration extends SourceConfiguration {
  readonly endpoints: readonly SourceEndpointConfiguration[];
}

export interface BootstrapDocument {
  readonly publication: PublicationConfiguration;
  readonly sources: readonly BootstrapSourceConfiguration[];
}

export interface BootstrapResult {
  readonly publicationCreated: boolean;
  readonly sourcesCreated: number;
  readonly endpointsCreated: number;
}

export class BootstrapDocumentError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid bootstrap document: ${reason}`);
    this.name = 'BootstrapDocumentError';
    this.reason = reason;
  }
}

export function parseBootstrapDocument(
  json: string,
): Readonly<BootstrapDocument> {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new BootstrapDocumentError('invalid_json');
  }
  return normalizeBootstrapDocument(input);
}

export function normalizeBootstrapDocument(
  input: unknown,
): Readonly<BootstrapDocument> {
  const document = record(input, 'document');
  exactKeys(document, ['publication', 'sources'], 'document');
  if (!Array.isArray(document.sources)) {
    throw new BootstrapDocumentError('sources_must_be_an_array');
  }

  const publicationInput = record(document.publication, 'publication');
  exactKeys(
    publicationInput,
    ['name', 'activeForCollection', 'publicStatus'],
    'publication',
    ['description', 'logoPath', 'accentColor', 'presentationTimezone'],
  );
  const publication = normalizePublicationConfiguration(publicationInput);
  const sourceKeys = new Set<string>();
  const sources = document.sources.map((sourceInput, sourceIndex) => {
    const sourceField = `sources[${String(sourceIndex)}]`;
    const sourceRecord = record(sourceInput, sourceField);
    exactKeys(
      sourceRecord,
      [
        'configKey',
        'displayName',
        'siteUrl',
        'approvalState',
        'lifecycleState',
        'operationalState',
        'domainRules',
        'endpoints',
      ],
      sourceField,
      ['priority', 'rssAtomAdmissionPhrases'],
    );
    if (!Array.isArray(sourceRecord.endpoints)) {
      throw new BootstrapDocumentError('source_endpoints_must_be_an_array');
    }
    const source = normalizeSourceConfiguration(sourceRecord);
    if (sourceKeys.has(source.configKey)) {
      throw new BootstrapDocumentError('duplicate_source_config_key');
    }
    sourceKeys.add(source.configKey);

    const endpointKeys = new Set<string>();
    const endpoints = sourceRecord.endpoints.map(
      (endpointInput, endpointIndex) => {
        const endpointField = `${sourceField}.endpoints[${String(endpointIndex)}]`;
        const endpointRecord = record(endpointInput, endpointField);
        exactKeys(
          endpointRecord,
          [
            'configKey',
            'endpointUrl',
            'endpointType',
            'approvalState',
            'lifecycleState',
            'operationalState',
            'pollIntervalSeconds',
          ],
          endpointField,
          ['endpointDomainRules', 'htmlListingProfile'],
        );
        const endpoint = normalizeSourceEndpointConfigurationForSource(
          endpointRecord,
          source.domainRules,
        );
        if (endpointKeys.has(endpoint.configKey)) {
          throw new BootstrapDocumentError('duplicate_endpoint_config_key');
        }
        endpointKeys.add(endpoint.configKey);
        return endpoint;
      },
    );
    return Object.freeze({ ...source, endpoints: Object.freeze(endpoints) });
  });
  return Object.freeze({ publication, sources: Object.freeze(sources) });
}

export async function bootstrapPublicationTree(
  database: Database,
  document: Readonly<BootstrapDocument>,
): Promise<Readonly<BootstrapResult>> {
  return database.transaction(async (transaction) => {
    const publication = await createPublicationSettingsIfAbsent(
      transaction,
      document.publication,
    );
    let sourcesCreated = 0;
    let endpointsCreated = 0;
    for (const sourceInput of document.sources) {
      const source = await createSourceIfAbsent(
        transaction,
        sourcePersistenceInput(sourceInput),
      );
      if (source.created) sourcesCreated += 1;
      for (const endpointInput of sourceInput.endpoints) {
        const existing = await findSourceEndpointBySourceAndConfigKey(
          transaction,
          source.value.id,
          endpointInput.configKey,
        );
        if (existing !== undefined) continue;

        const persistedRules = await loadSourceApprovedDomainRules(
          transaction,
          source.value.id,
        );
        const proposed = normalizeSourceEndpointConfigurationForSource(
          endpointPersistenceInput(endpointInput),
          persistedRules,
        );
        const endpoint = await createSourceEndpointIfAbsent(
          transaction,
          source.value.id,
          endpointPersistenceInput(proposed),
        );
        if (endpoint.created) endpointsCreated += 1;
      }
    }
    return Object.freeze({
      publicationCreated: publication.created,
      sourcesCreated,
      endpointsCreated,
    });
  });
}

function sourcePersistenceInput(source: BootstrapSourceConfiguration) {
  return {
    configKey: source.configKey,
    displayName: source.displayName,
    siteUrl: source.siteUrl.value,
    approvalState: source.approvalState,
    lifecycleState: source.lifecycleState,
    operationalState: source.operationalState,
    domainRules: source.domainRules,
    priority: source.priority,
    ...(source.rssAtomAdmissionPhrases.length === 0
      ? {}
      : { rssAtomAdmissionPhrases: source.rssAtomAdmissionPhrases }),
  };
}

function endpointPersistenceInput(endpoint: SourceEndpointConfiguration) {
  return {
    configKey: endpoint.configKey,
    endpointUrl: endpoint.endpointUrl.value,
    endpointType: endpoint.endpointType,
    approvalState: endpoint.approvalState,
    lifecycleState: endpoint.lifecycleState,
    operationalState: endpoint.operationalState,
    pollIntervalSeconds: endpoint.pollIntervalSeconds,
    endpointDomainRules: endpoint.endpointDomainRules,
    ...(endpoint.endpointType === 'html_listing'
      ? { htmlListingProfile: endpoint.htmlListingProfile }
      : {}),
  };
}

function record(input: unknown, field: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new BootstrapDocumentError(`${field}_must_be_an_object`);
  }
  return input as Record<string, unknown>;
}

function exactKeys(
  input: Record<string, unknown>,
  required: readonly string[],
  field: string,
  optional: readonly string[] = [],
): void {
  if (required.some((key) => !(key in input))) {
    throw new BootstrapDocumentError(`${field}_missing_required_field`);
  }
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new BootstrapDocumentError(`${field}_unknown_field`);
  }
}
