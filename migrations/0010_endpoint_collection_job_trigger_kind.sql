ALTER TABLE endpoint_collection_jobs
  ADD COLUMN trigger_kind text NOT NULL DEFAULT 'scheduled',
  ADD CONSTRAINT endpoint_collection_jobs_trigger_kind_check CHECK (
    trigger_kind IN ('scheduled', 'manual')
  );

CREATE INDEX collection_runs_endpoint_recent_idx
  ON collection_runs (source_endpoint_id, started_at DESC, id DESC);
