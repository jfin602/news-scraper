ALTER TABLE collection_runs
  ADD COLUMN normalization_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN normalized_candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN normalization_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN article_link_rejection_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT collection_runs_normalization_status_check CHECK (
    normalization_status IN ('not_run', 'succeeded', 'failed')
  ),
  ADD CONSTRAINT collection_runs_normalized_candidate_count_check CHECK (
    normalized_candidate_count >= 0
  ),
  ADD CONSTRAINT collection_runs_normalization_failure_count_check CHECK (
    normalization_failure_count >= 0
  ),
  ADD CONSTRAINT collection_runs_article_link_rejection_count_check CHECK (
    article_link_rejection_count >= 0
    AND article_link_rejection_count <= normalized_candidate_count
  ),
  ADD CONSTRAINT collection_runs_normalization_not_run_check CHECK (
    normalization_status <> 'not_run'
    OR (
      normalized_candidate_count = 0
      AND normalization_failure_count = 0
      AND article_link_rejection_count = 0
    )
  ),
  ADD CONSTRAINT collection_runs_normalization_parser_check CHECK (
    normalization_status = 'not_run' OR parser_status = 'succeeded'
  ),
  ADD CONSTRAINT collection_runs_normalization_arithmetic_check CHECK (
    normalization_status <> 'succeeded'
    OR raw_item_count = normalized_candidate_count + normalization_failure_count
  ),
  ADD CONSTRAINT collection_runs_normalization_run_status_check CHECK (
    normalization_status <> 'failed' OR run_status <> 'succeeded'
  );
