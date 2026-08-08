import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CollectionRunPersistenceError,
  mapCollectionRunRow,
  type CollectionRunRow,
} from '../../src/collection/runs/repository.ts';

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
    }),
  );

  assert.equal(run.wireByteCount, 1234);
  assert.equal(run.decompressedByteCount, 5678);
  assert.equal(run.rawItemCount, 2);
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
    validRow({ error_code: 'unsafe-code' }),
    validRow({ error_detail: ' '.repeat(1) }),
  ]) {
    assert.throws(
      () => mapCollectionRunRow(row),
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
    http_status_code: null,
    wire_byte_count: null,
    decompressed_byte_count: null,
    raw_item_count: 0,
    error_code: null,
    error_detail: null,
    ...overrides,
  };
}
