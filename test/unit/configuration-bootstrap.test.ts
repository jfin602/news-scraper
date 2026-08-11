import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  BootstrapDocumentError,
  normalizeBootstrapDocument,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import { ConfigurationValidationError } from '../../src/publication/configuration.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);

test('generic bootstrap JSON normalizes one complete Publication tree', async () => {
  const document = parseBootstrapDocument(await readFile(fixtureUrl, 'utf8'));

  assert.equal(document.publication.name, 'Technology Bulletin');
  assert.equal(document.sources.length, 2);
  assert.equal(document.sources[0]?.siteUrl.hostname, 'www.circuit.example');
  assert.equal(
    document.sources[0]?.endpoints[0]?.endpointUrl.hostname,
    'feeds.circuit.example',
  );
  assert.equal(document.sources[1]?.approvalState, 'approved');
});

test('bootstrap parsing rejects malformed JSON with a bounded error', () => {
  assert.throws(
    () => parseBootstrapDocument('{"publication":'),
    (error: unknown) =>
      error instanceof BootstrapDocumentError &&
      error.message === 'Invalid bootstrap document: invalid_json',
  );
});

test('bootstrap validation rejects duplicate Source and endpoint stable keys', async () => {
  const input = JSON.parse(await readFile(fixtureUrl, 'utf8')) as {
    sources: Array<Record<string, unknown> & { endpoints: unknown[] }>;
  };
  input.sources.push(structuredClone(input.sources[0] as never));
  assert.throws(
    () => normalizeBootstrapDocument(input),
    (error: unknown) =>
      error instanceof BootstrapDocumentError &&
      error.reason === 'duplicate_source_config_key',
  );

  input.sources.pop();
  input.sources[0]?.endpoints.push(
    structuredClone(input.sources[0]?.endpoints[0]),
  );
  assert.throws(
    () => normalizeBootstrapDocument(input),
    (error: unknown) =>
      error instanceof BootstrapDocumentError &&
      error.reason === 'duplicate_endpoint_config_key',
  );
});

test('bootstrap validation rejects unknown fields and invalid normalized values', async () => {
  const input = JSON.parse(await readFile(fixtureUrl, 'utf8')) as {
    publication: Record<string, unknown>;
    sources: Array<Record<string, unknown>>;
  };
  input.publication.slug = 'obsolete-publication-selector';
  assert.throws(
    () => normalizeBootstrapDocument(input),
    (error: unknown) =>
      error instanceof BootstrapDocumentError &&
      error.reason === 'publication_unknown_field',
  );

  delete input.publication.slug;
  input.sources[0]!.approvalState = 'trusted';
  assert.throws(
    () => normalizeBootstrapDocument(input),
    ConfigurationValidationError,
  );
});
