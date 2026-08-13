ALTER TABLE collection_runs
  ADD COLUMN trigger_kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN retry_classification text,
  ADD COLUMN outcome_code text,
  ADD COLUMN response_etag text,
  ADD COLUMN response_last_modified text,
  ADD CONSTRAINT collection_runs_trigger_kind_check CHECK (
    trigger_kind IN ('manual', 'scheduled')
  ),
  ADD CONSTRAINT collection_runs_retry_classification_check CHECK (
    retry_classification IS NULL
    OR (
      run_status = 'failed'
      AND retry_classification IN ('transient', 'permanent')
    )
  ),
  ADD CONSTRAINT collection_runs_outcome_code_check CHECK (
    outcome_code IS NULL
    OR outcome_code IN (
      'content',
      'not_modified',
      'network_safety_blocked',
      'fetch_failed',
      'parser_failed',
      'normalization_failed',
      'article_link_policy_failed',
      'processing_failed',
      'worker_interrupted'
    )
  ),
  ADD CONSTRAINT collection_runs_response_etag_shape_check CHECK (
    response_etag IS NULL
    OR (
      char_length(response_etag) BETWEEN 1 AND 1024
      AND response_etag !~ E'[\\r\\n]'
    )
  ),
  ADD CONSTRAINT collection_runs_response_last_modified_shape_check CHECK (
    response_last_modified IS NULL
    OR (
      char_length(response_last_modified) BETWEEN 1 AND 1024
      AND response_last_modified !~ E'[\\r\\n]'
    )
  );

CREATE UNIQUE INDEX collection_runs_execution_id_unique
  ON collection_runs (execution_id);
