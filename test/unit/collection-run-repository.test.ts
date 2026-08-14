import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CollectionRunPersistenceError,
  finalizeCollectionRun,
  mapCollectionRunRow,
  type CollectionRunRow,
} from '../../src/collection/runs/repository.ts';

test('maps truthful not-run normalization and processing defaults', () => {
  const run = mapCollectionRunRow(validRow());
  assert.equal(run.normalizationStatus, 'not_run');
  assert.equal(run.sourceItemFilteredCount, 0);
  assert.equal(run.normalizedCandidateCount, 0);
  assert.equal(run.normalizationFailureCount, 0);
  assert.equal(run.articleLinkRejectionCount, 0);
  assert.equal(run.processingStatus, 'not_run');
  assert.deepEqual(processingCounts(run), [0, 0, 0, 0, 0, 0]);
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
      redirect_count: 2,
      transport_elapsed_milliseconds: 12.5,
      trigger_kind: 'scheduled',
      outcome_code: 'content',
      response_etag: '"fixture"',
      response_last_modified: 'Sat, 08 Aug 2026 12:00:00 GMT',
      raw_item_count: 3,
      source_item_filtered_count: 1,
      normalization_status: 'succeeded',
      normalized_candidate_count: '1',
      normalization_failure_count: 1,
      article_link_rejection_count: 1,
    }),
  );

  assert.equal(run.wireByteCount, 1234);
  assert.equal(run.decompressedByteCount, 5678);
  assert.equal(run.redirectCount, 2);
  assert.equal(run.transportElapsedMilliseconds, 12.5);
  assert.equal(run.triggerKind, 'scheduled');
  assert.equal(run.outcomeCode, 'content');
  assert.equal(run.responseEtag, '"fixture"');
  assert.equal(run.responseLastModified, 'Sat, 08 Aug 2026 12:00:00 GMT');
  assert.equal(run.rawItemCount, 3);
  assert.equal(run.sourceItemFilteredCount, 1);
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
    validRow({ trigger_kind: 'automatic' }),
    validRow({ retry_classification: 'sometimes' }),
    validRow({ outcome_code: 'unknown' }),
    validRow({ response_etag: 'unsafe\nvalue' }),
    validRow({ http_status_code: 600 }),
    validRow({ wire_byte_count: '-1' }),
    validRow({ redirect_count: -1 }),
    validRow({ transport_elapsed_milliseconds: -1 }),
    validRow({ raw_item_count: -1 }),
    validRow({ source_item_filtered_count: -1 }),
    validRow({ raw_item_count: 1, source_item_filtered_count: 2 }),
    validRow({ normalization_status: 'invalid' }),
    validRow({ processing_status: 'invalid' }),
    validRow({ normalized_candidate_count: -1 }),
    validRow({ normalization_failure_count: -1 }),
    validRow({ article_link_rejection_count: -1 }),
    validRow({
      normalized_candidate_count: 1,
      article_link_rejection_count: 2,
    }),
    validRow({ normalized_candidate_count: 1 }),
    validRow({ created_count: 1 }),
    validRow({
      processing_status: 'succeeded',
      normalization_status: 'not_run',
    }),
    validRow({
      processing_status: 'succeeded',
      normalization_status: 'succeeded',
      parser_status: 'succeeded',
      normalized_candidate_count: 1,
    }),
    validRow({
      processing_status: 'failed',
      normalization_status: 'succeeded',
      parser_status: 'succeeded',
      run_status: 'succeeded',
    }),
    validRow({
      processing_status: 'succeeded',
      normalization_status: 'succeeded',
      parser_status: 'succeeded',
      normalized_candidate_count: 1,
      article_link_rejection_count: 1,
      created_count: 1,
    }),
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
    processingStatus: 'not_run',
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    rejectedCount: 0,
    excludedCount: 0,
    failedCount: 0,
    sourceItemFilteredCount: 0,
  } as const;
  for (const input of [
    { ...valid, normalizationStatus: 'invalid' },
    { ...valid, sourceItemFilteredCount: -1 },
    { ...valid, sourceItemFilteredCount: 3 },
    { ...valid, normalizedCandidateCount: -1 },
    { ...valid, normalizationFailureCount: -1 },
    { ...valid, articleLinkRejectionCount: -1 },
    { ...valid, articleLinkRejectionCount: 2 },
    { ...valid, normalizationStatus: 'not_run' },
    { ...valid, rawItemCount: 3 },
    { ...valid, parserStatus: 'failed' },
    { ...valid, runStatus: 'succeeded', normalizationStatus: 'failed' },
    { ...valid, processingStatus: 'invalid' },
    { ...valid, createdCount: -1 },
    { ...valid, createdCount: 1 },
    {
      ...valid,
      processingStatus: 'succeeded',
      normalizedCandidateCount: 1,
      rawItemCount: 2,
      rejectedCount: 0,
    },
    {
      ...valid,
      processingStatus: 'failed',
      runStatus: 'succeeded',
    },
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
    trigger_kind: 'manual',
    started_at: new Date('2026-08-08T12:00:00.000Z'),
    finished_at: null,
    run_status: 'running',
    transport_status: 'not_run',
    parser_status: 'not_run',
    normalization_status: 'not_run',
    processing_status: 'not_run',
    http_status_code: null,
    wire_byte_count: null,
    decompressed_byte_count: null,
    redirect_count: null,
    transport_elapsed_milliseconds: null,
    retry_classification: null,
    outcome_code: null,
    response_etag: null,
    response_last_modified: null,
    raw_item_count: 0,
    source_item_filtered_count: 0,
    normalized_candidate_count: 0,
    normalization_failure_count: 0,
    article_link_rejection_count: 0,
    created_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    rejected_count: 0,
    excluded_count: 0,
    failed_count: 0,
    error_code: null,
    error_detail: null,
    ...overrides,
  };
}

function processingCounts(run: {
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
}): readonly number[] {
  return [
    run.createdCount,
    run.updatedCount,
    run.unchangedCount,
    run.rejectedCount,
    run.excludedCount,
    run.failedCount,
  ];
}
