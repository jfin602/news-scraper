ALTER TABLE source_endpoints
  ADD COLUMN next_due_at timestamptz,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN last_failure_at timestamptz,
  ADD COLUMN consecutive_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN cooldown_until timestamptz,
  ADD COLUMN etag text,
  ADD COLUMN last_modified text,
  ADD CONSTRAINT source_endpoints_consecutive_failure_count_check CHECK (
    consecutive_failure_count >= 0
  ),
  ADD CONSTRAINT source_endpoints_etag_shape_check CHECK (
    etag IS NULL
    OR (
      char_length(etag) BETWEEN 1 AND 1024
      AND etag !~ E'[\\r\\n]'
    )
  ),
  ADD CONSTRAINT source_endpoints_last_modified_shape_check CHECK (
    last_modified IS NULL
    OR (
      char_length(last_modified) BETWEEN 1 AND 1024
      AND last_modified !~ E'[\\r\\n]'
    )
  );

ALTER TABLE collection_runs
  ADD COLUMN redirect_count integer,
  ADD COLUMN transport_elapsed_milliseconds double precision,
  ADD CONSTRAINT collection_runs_redirect_count_check CHECK (
    redirect_count IS NULL OR redirect_count >= 0
  ),
  ADD CONSTRAINT collection_runs_transport_elapsed_milliseconds_check CHECK (
    transport_elapsed_milliseconds IS NULL
    OR transport_elapsed_milliseconds >= 0
  );
