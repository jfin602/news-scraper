CREATE TABLE endpoint_collection_jobs (
  id uuid PRIMARY KEY,
  source_endpoint_id uuid NOT NULL REFERENCES source_endpoints (id),
  status text NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL,
  attempt_number integer NOT NULL,
  previous_job_id uuid,
  claim_worker_id text,
  claim_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  collection_run_id uuid UNIQUE,
  terminal_at timestamptz,
  outcome_code text,
  reason_code text,
  error_code text,
  error_detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT endpoint_collection_jobs_endpoint_id_id_unique UNIQUE (
    source_endpoint_id,
    id
  ),
  CONSTRAINT endpoint_collection_jobs_previous_job_fk
    FOREIGN KEY (source_endpoint_id, previous_job_id)
    REFERENCES endpoint_collection_jobs (source_endpoint_id, id),
  CONSTRAINT endpoint_collection_jobs_collection_run_fk
    FOREIGN KEY (source_endpoint_id, collection_run_id)
    REFERENCES collection_runs (source_endpoint_id, id),
  CONSTRAINT endpoint_collection_jobs_status_check CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'abandoned')
  ),
  CONSTRAINT endpoint_collection_jobs_attempt_check CHECK (
    (attempt_number = 1 AND previous_job_id IS NULL)
    OR (attempt_number > 1 AND previous_job_id IS NOT NULL)
  ),
  CONSTRAINT endpoint_collection_jobs_no_self_reference_check CHECK (
    previous_job_id IS NULL OR previous_job_id <> id
  ),
  CONSTRAINT endpoint_collection_jobs_worker_id_shape_check CHECK (
    claim_worker_id IS NULL
    OR (
      claim_worker_id = btrim(claim_worker_id)
      AND char_length(claim_worker_id) BETWEEN 1 AND 200
      AND claim_worker_id !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT endpoint_collection_jobs_lease_order_check CHECK (
    lease_expires_at IS NULL
    OR (claimed_at IS NOT NULL AND lease_expires_at > claimed_at)
  ),
  CONSTRAINT endpoint_collection_jobs_terminal_order_check CHECK (
    terminal_at IS NULL
    OR (claimed_at IS NOT NULL AND terminal_at >= claimed_at)
  ),
  CONSTRAINT endpoint_collection_jobs_outcome_code_shape_check CHECK (
    outcome_code IS NULL
    OR (
      char_length(outcome_code) BETWEEN 1 AND 100
      AND outcome_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT endpoint_collection_jobs_reason_code_shape_check CHECK (
    reason_code IS NULL
    OR (
      char_length(reason_code) BETWEEN 1 AND 100
      AND reason_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT endpoint_collection_jobs_error_code_shape_check CHECK (
    error_code IS NULL
    OR (
      char_length(error_code) BETWEEN 1 AND 100
      AND error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT endpoint_collection_jobs_error_detail_shape_check CHECK (
    error_detail IS NULL
    OR (
      error_detail = btrim(error_detail)
      AND char_length(error_detail) BETWEEN 1 AND 2000
      AND error_detail !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT endpoint_collection_jobs_state_shape_check CHECK (
    (
      status = 'queued'
      AND claim_worker_id IS NULL
      AND claim_token IS NULL
      AND claimed_at IS NULL
      AND lease_expires_at IS NULL
      AND collection_run_id IS NULL
      AND terminal_at IS NULL
      AND outcome_code IS NULL
      AND reason_code IS NULL
      AND error_code IS NULL
      AND error_detail IS NULL
    )
    OR (
      status = 'running'
      AND claim_worker_id IS NOT NULL
      AND claim_token IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND terminal_at IS NULL
      AND outcome_code IS NULL
      AND reason_code IS NULL
      AND error_code IS NULL
      AND error_detail IS NULL
    )
    OR (
      status IN ('succeeded', 'failed', 'skipped', 'abandoned')
      AND claim_worker_id IS NOT NULL
      AND claim_token IS NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at IS NULL
      AND terminal_at IS NOT NULL
      AND outcome_code IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX endpoint_collection_jobs_one_outstanding_per_endpoint
  ON endpoint_collection_jobs (source_endpoint_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX endpoint_collection_jobs_claim_order
  ON endpoint_collection_jobs (available_at, enqueued_at, id)
  WHERE status = 'queued';

CREATE INDEX endpoint_collection_jobs_expired_running_order
  ON endpoint_collection_jobs (lease_expires_at, claimed_at, id)
  WHERE status = 'running';
