CREATE TABLE collection_runs (
  id uuid PRIMARY KEY,
  source_endpoint_id uuid NOT NULL REFERENCES source_endpoints (id),
  execution_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  run_status text NOT NULL,
  transport_status text NOT NULL,
  parser_status text NOT NULL,
  http_status_code integer,
  wire_byte_count bigint,
  decompressed_byte_count bigint,
  raw_item_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_detail text,
  CONSTRAINT collection_runs_execution_id_shape_check CHECK (
    execution_id = btrim(execution_id)
    AND char_length(execution_id) BETWEEN 1 AND 200
  ),
  CONSTRAINT collection_runs_run_status_check CHECK (
    run_status IN ('running', 'succeeded', 'failed')
  ),
  CONSTRAINT collection_runs_transport_status_check CHECK (
    transport_status IN ('not_run', 'succeeded', 'not_modified', 'failed')
  ),
  CONSTRAINT collection_runs_parser_status_check CHECK (
    parser_status IN ('not_run', 'succeeded', 'failed')
  ),
  CONSTRAINT collection_runs_http_status_code_check CHECK (
    http_status_code IS NULL OR http_status_code BETWEEN 100 AND 599
  ),
  CONSTRAINT collection_runs_wire_byte_count_check CHECK (
    wire_byte_count IS NULL OR wire_byte_count >= 0
  ),
  CONSTRAINT collection_runs_decompressed_byte_count_check CHECK (
    decompressed_byte_count IS NULL OR decompressed_byte_count >= 0
  ),
  CONSTRAINT collection_runs_raw_item_count_check CHECK (raw_item_count >= 0),
  CONSTRAINT collection_runs_error_code_shape_check CHECK (
    error_code IS NULL
    OR (
      char_length(error_code) BETWEEN 1 AND 100
      AND error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT collection_runs_error_detail_shape_check CHECK (
    error_detail IS NULL
    OR (
      char_length(error_detail) BETWEEN 1 AND 2000
      AND btrim(error_detail) <> ''
    )
  ),
  CONSTRAINT collection_runs_terminal_finish_check CHECK (
    (run_status = 'running' AND finished_at IS NULL)
    OR (run_status IN ('succeeded', 'failed') AND finished_at IS NOT NULL)
  ),
  CONSTRAINT collection_runs_finish_after_start_check CHECK (
    finished_at IS NULL OR finished_at >= started_at
  )
);
