ALTER TABLE collection_runs
  ADD COLUMN processing_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN created_count integer NOT NULL DEFAULT 0,
  ADD COLUMN updated_count integer NOT NULL DEFAULT 0,
  ADD COLUMN unchanged_count integer NOT NULL DEFAULT 0,
  ADD COLUMN rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN excluded_count integer NOT NULL DEFAULT 0,
  ADD COLUMN failed_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT collection_runs_processing_status_check CHECK (
    processing_status IN ('not_run', 'succeeded', 'failed')
  ),
  ADD CONSTRAINT collection_runs_created_count_check CHECK (created_count >= 0),
  ADD CONSTRAINT collection_runs_updated_count_check CHECK (updated_count >= 0),
  ADD CONSTRAINT collection_runs_unchanged_count_check CHECK (unchanged_count >= 0),
  ADD CONSTRAINT collection_runs_rejected_count_check CHECK (rejected_count >= 0),
  ADD CONSTRAINT collection_runs_excluded_count_check CHECK (excluded_count >= 0),
  ADD CONSTRAINT collection_runs_failed_count_check CHECK (failed_count >= 0),
  ADD CONSTRAINT collection_runs_processing_not_run_check CHECK (
    processing_status <> 'not_run'
    OR (
      created_count = 0
      AND updated_count = 0
      AND unchanged_count = 0
      AND rejected_count = 0
      AND excluded_count = 0
      AND failed_count = 0
    )
  ),
  ADD CONSTRAINT collection_runs_processing_normalization_check CHECK (
    processing_status = 'not_run' OR normalization_status = 'succeeded'
  ),
  ADD CONSTRAINT collection_runs_processing_arithmetic_check CHECK (
    processing_status = 'not_run'
    OR created_count + updated_count + unchanged_count + rejected_count + excluded_count + failed_count
      = normalized_candidate_count
  ),
  ADD CONSTRAINT collection_runs_processing_failed_run_status_check CHECK (
    processing_status <> 'failed' OR run_status = 'failed'
  ),
  ADD CONSTRAINT collection_runs_processing_rejected_link_rejections_check CHECK (
    processing_status = 'not_run' OR rejected_count >= article_link_rejection_count
  );
