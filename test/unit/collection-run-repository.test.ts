import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CollectionRunPersistenceError,
  finalizeCollectionRun,
  mapCollectionRunRow,
  type CollectionRunRow,
} from '../../src/collection/runs/repository.ts';

test('maps truthful not-run normalization defaults', () => {
  const run = mapCollectionRunRow(validRow());
  assert.equal(run.normalizationStatus, 'not_run');
  assert.equal(run.normalizedCandidateCount, 0);
  assert.equal(run.normalizationFailureCount, 0);
  assert.equal(run.articleLinkRejectionCount, 0);
  assert.ok(Object.isFrozen(run));
});

test('maps a bounded persisted Collection run and PostgreSQL bigint byte counts', () => {
  const run = mapCollectionRunRow(
    validRow({
      finished_at: new Date('2026-08-08T12:00:01.000Z'),
      run_status: 'succeeded',
      transport_status: 'succeeded',
      parser_status: 'succeeded',
      http_status_code: 200,
      wire_byte_count: '1234',
      decompressed_byte_count: '5678',
      raw_item_count: 2,
      normalization_status: 'succeeded',
      normalized_candidate_count: '1',
      normalization_failure_count: 1,
      article_link_rejection_count: 1,
    }),
  );

  assert.equal(run.wireByteCount, 1234);
  assert.equal(run.decompressedByteCount, 5678);
  assert.equal(run.rawItemCount, 2);
  assert.equal(run.normalizedCandidateCount, 1);
  assert.equal(run.normalizationFailureCount, 1);
  assert.equal(run.articleLinkRejectionCount, 1);
  assert.ok(Object.isFrozen(run));
});

test('rejects malformed Collection-run rows at mapping boundaries', () => {
  for (const row of [
    validRow({ run_status: 'invalid' }),
    validRow({ source_endpoint_id: 'not-a-uuid' }),
    validRow({ execution_id: ' padded_execution' }),
    validRow({ http_status_code: 600 }),
    validRow({ wire_byte_count: '-1' }),
    validRow({ raw_item_count: -1 }),
    validRow({ normalization_status: 'invalid' }),
    validRow({ normalized_candidate_count: -1 }),
    validRow({ normalization_failure_count: -1 }),
    validRow({ article_link_rejection_count: -1 }),
    validRow({
      normalized_candidate_count: 1,
      article_link_rejection_count: 2,
    }),
    validRow({ normalized_candidate_count: 1 }),
    validRow({ normalization_status: 'succeeded', parser_status: 'not_run' }),
    validRow({
      normalization_status: 'succeeded',
      parser_status: 'succeeded',
      raw_item_count: 1,
    }),
    validRow({
      normalization_status: 'failed',
      parser_status: 'succeeded',
      run_status: 'succeeded',
    }),
    validRow({ error_code: 'unsafe-code' }),
    validRow({ error_detail: ' '.repeat(1) }),
  ]) {
    assert.throws(
      () => mapCollectionRunRow(row),
      CollectionRunPersistenceError,
    );
  }
});

test('rejects invalid terminal normalization accounting before querying', async () => {
  const executor = {
    async query() {
      throw new Error('query should not execute');
    },
  };
  const valid = {
    runStatus: 'succeeded',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    normalizationStatus: 'succeeded',
    rawItemCount: 2,
    normalizedCandidateCount: 1,
    normalizationFailureCount: 1,
    articleLinkRejectionCount: 0,
  } as const;
  for (const input of [
    { ...valid, normalizationStatus: 'invalid' },
    { ...valid, normalizedCandidateCount: -1 },
    { ...valid, normalizationFailureCount: -1 },
    { ...valid, articleLinkRejectionCount: -1 },
    { ...valid, articleLinkRejectionCount: 2 },
    { ...valid, normalizationStatus: 'not_run' },
    { ...valid, rawItemCount: 3 },
    { ...valid, parserStatus: 'failed' },
    { ...valid, runStatus: 'succeeded', normalizationStatus: 'failed' },
  ]) {
    await assert.rejects(
      finalizeCollectionRun(
        executor,
        '00000000-0000-0000-0000-000000000001',
        input as Parameters<typeof finalizeCollectionRun>[2],
      ),
      CollectionRunPersistenceError,
    );
  }
});

function validRow(overrides: Partial<CollectionRunRow> = {}): CollectionRunRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    source_endpoint_id: '00000000-0000-0000-0000-000000000002',
    execution_id: 'worker_execution',
    started_at: new Date('2026-08-08T12:00:00.000Z'),
    finished_at: null,
    run_status: 'running',
    transport_status: 'not_run',
    parser_status: 'not_run',
    normalization_status: 'not_run',
    http_status_code: null,
    wire_byte_count: null,
    decompressed_byte_count: null,
    raw_item_count: 0,
    normalized_candidate_count: 0,
    normalization_failure_count: 0,
    article_link_rejection_count: 0,
    error_code: null,
    error_detail: null,
    ...overrides,
  };
}
