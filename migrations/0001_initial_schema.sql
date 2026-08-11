CREATE TABLE publication_settings (
  name text NOT NULL,
  active_for_collection boolean NOT NULL,
  public_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_settings_name_shape_check CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 1 AND 200
  ),
  CONSTRAINT publication_settings_public_status_check CHECK (
    public_status IN ('private', 'public')
  )
);

CREATE UNIQUE INDEX publication_settings_singleton_unique
  ON publication_settings ((true));

CREATE TABLE sources (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  display_name text NOT NULL,
  site_url text NOT NULL,
  approval_state text NOT NULL,
  lifecycle_state text NOT NULL,
  operational_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_config_key_unique UNIQUE (config_key),
  CONSTRAINT sources_config_key_shape_check CHECK (
    char_length(config_key) BETWEEN 1 AND 100
    AND config_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT sources_display_name_shape_check CHECK (
    display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT sources_site_url_shape_check CHECK (
    char_length(site_url) BETWEEN 1 AND 2048 AND btrim(site_url) <> ''
  ),
  CONSTRAINT sources_approval_state_check CHECK (
    approval_state IN ('approved', 'unapproved')
  ),
  CONSTRAINT sources_lifecycle_state_check CHECK (
    lifecycle_state IN ('active', 'archived')
  ),
  CONSTRAINT sources_operational_state_check CHECK (
    operational_state IN ('enabled', 'paused', 'disabled')
  )
);

CREATE TABLE source_approved_domain_rules (
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  hostname text NOT NULL,
  include_subdomains boolean NOT NULL DEFAULT false,
  CONSTRAINT source_approved_domain_rules_source_hostname_unique UNIQUE (source_id, hostname),
  CONSTRAINT source_approved_domain_rules_hostname_shape_check CHECK (
    hostname = lower(hostname)
    AND hostname = btrim(hostname)
    AND char_length(hostname) BETWEEN 1 AND 253
  )
);

CREATE TABLE source_endpoints (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES sources (id),
  config_key text NOT NULL,
  endpoint_url text NOT NULL,
  endpoint_type text NOT NULL,
  approval_state text NOT NULL,
  lifecycle_state text NOT NULL,
  operational_state text NOT NULL,
  poll_interval_seconds integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_endpoints_source_id_id_unique UNIQUE (source_id, id),
  CONSTRAINT source_endpoints_source_config_key_unique UNIQUE (source_id, config_key),
  CONSTRAINT source_endpoints_source_url_unique UNIQUE (source_id, endpoint_url),
  CONSTRAINT source_endpoints_config_key_shape_check CHECK (
    char_length(config_key) BETWEEN 1 AND 100
    AND config_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT source_endpoints_url_shape_check CHECK (
    char_length(endpoint_url) BETWEEN 1 AND 2048 AND btrim(endpoint_url) <> ''
  ),
  CONSTRAINT source_endpoints_type_check CHECK (endpoint_type = 'rss_atom'),
  CONSTRAINT source_endpoints_approval_state_check CHECK (
    approval_state IN ('approved', 'unapproved')
  ),
  CONSTRAINT source_endpoints_lifecycle_state_check CHECK (
    lifecycle_state IN ('active', 'archived')
  ),
  CONSTRAINT source_endpoints_operational_state_check CHECK (
    operational_state IN ('enabled', 'paused', 'disabled')
  ),
  CONSTRAINT source_endpoints_poll_interval_check CHECK (
    poll_interval_seconds BETWEEN 60 AND 2592000
  )
);

CREATE TABLE source_endpoint_domain_rules (
  source_endpoint_id uuid NOT NULL REFERENCES source_endpoints (id) ON DELETE CASCADE,
  hostname text NOT NULL,
  include_subdomains boolean NOT NULL DEFAULT false,
  CONSTRAINT source_endpoint_domain_rules_endpoint_hostname_unique UNIQUE (
    source_endpoint_id,
    hostname
  ),
  CONSTRAINT source_endpoint_domain_rules_hostname_shape_check CHECK (
    hostname = lower(hostname)
    AND hostname = btrim(hostname)
    AND char_length(hostname) BETWEEN 1 AND 253
  )
);

CREATE TABLE collection_runs (
  id uuid PRIMARY KEY,
  source_endpoint_id uuid NOT NULL REFERENCES source_endpoints (id),
  execution_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  run_status text NOT NULL,
  transport_status text NOT NULL,
  parser_status text NOT NULL,
  normalization_status text NOT NULL DEFAULT 'not_run',
  processing_status text NOT NULL DEFAULT 'not_run',
  http_status_code integer,
  wire_byte_count bigint,
  decompressed_byte_count bigint,
  raw_item_count integer NOT NULL DEFAULT 0,
  normalized_candidate_count integer NOT NULL DEFAULT 0,
  normalization_failure_count integer NOT NULL DEFAULT 0,
  article_link_rejection_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  excluded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_detail text,
  CONSTRAINT collection_runs_endpoint_id_id_unique UNIQUE (source_endpoint_id, id),
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
  CONSTRAINT collection_runs_normalization_status_check CHECK (
    normalization_status IN ('not_run', 'succeeded', 'failed')
  ),
  CONSTRAINT collection_runs_processing_status_check CHECK (
    processing_status IN ('not_run', 'succeeded', 'failed')
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
  CONSTRAINT collection_runs_normalized_candidate_count_check CHECK (
    normalized_candidate_count >= 0
  ),
  CONSTRAINT collection_runs_normalization_failure_count_check CHECK (
    normalization_failure_count >= 0
  ),
  CONSTRAINT collection_runs_article_link_rejection_count_check CHECK (
    article_link_rejection_count >= 0
    AND article_link_rejection_count <= normalized_candidate_count
  ),
  CONSTRAINT collection_runs_created_count_check CHECK (created_count >= 0),
  CONSTRAINT collection_runs_updated_count_check CHECK (updated_count >= 0),
  CONSTRAINT collection_runs_unchanged_count_check CHECK (unchanged_count >= 0),
  CONSTRAINT collection_runs_rejected_count_check CHECK (rejected_count >= 0),
  CONSTRAINT collection_runs_excluded_count_check CHECK (excluded_count >= 0),
  CONSTRAINT collection_runs_failed_count_check CHECK (failed_count >= 0),
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
  ),
  CONSTRAINT collection_runs_normalization_not_run_check CHECK (
    normalization_status <> 'not_run'
    OR (
      normalized_candidate_count = 0
      AND normalization_failure_count = 0
      AND article_link_rejection_count = 0
    )
  ),
  CONSTRAINT collection_runs_normalization_parser_check CHECK (
    normalization_status = 'not_run' OR parser_status = 'succeeded'
  ),
  CONSTRAINT collection_runs_normalization_arithmetic_check CHECK (
    normalization_status <> 'succeeded'
    OR raw_item_count = normalized_candidate_count + normalization_failure_count
  ),
  CONSTRAINT collection_runs_normalization_run_status_check CHECK (
    normalization_status <> 'failed' OR run_status <> 'succeeded'
  ),
  CONSTRAINT collection_runs_processing_not_run_check CHECK (
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
  CONSTRAINT collection_runs_processing_normalization_check CHECK (
    processing_status = 'not_run' OR normalization_status = 'succeeded'
  ),
  CONSTRAINT collection_runs_processing_arithmetic_check CHECK (
    processing_status = 'not_run'
    OR created_count + updated_count + unchanged_count + rejected_count + excluded_count + failed_count
      = normalized_candidate_count
  ),
  CONSTRAINT collection_runs_processing_failed_run_status_check CHECK (
    processing_status <> 'failed' OR run_status = 'failed'
  ),
  CONSTRAINT collection_runs_processing_rejected_link_rejections_check CHECK (
    processing_status = 'not_run' OR rejected_count >= article_link_rejection_count
  )
);

CREATE TABLE articles (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES sources (id),
  external_id text,
  external_id_digest bytea GENERATED ALWAYS AS (
    sha256(external_id::bytea)
  ) STORED,
  original_url text NOT NULL,
  canonical_identity_url text NOT NULL,
  canonical_identity_digest bytea GENERATED ALWAYS AS (
    sha256(canonical_identity_url::bytea)
  ) STORED,
  display_title text NOT NULL,
  normalized_title text NOT NULL,
  author text,
  summary text,
  image_url text,
  language text,
  published_at_status text NOT NULL,
  published_at timestamptz,
  source_updated_at_status text NOT NULL,
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  visibility_state text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT articles_source_id_id_unique UNIQUE (source_id, id),
  CONSTRAINT articles_external_id_shape_check CHECK (
    external_id IS NULL
    OR (external_id = btrim(external_id) AND char_length(external_id) BETWEEN 1 AND 2048)
  ),
  CONSTRAINT articles_original_url_shape_check CHECK (
    original_url = btrim(original_url) AND char_length(original_url) BETWEEN 1 AND 8192
  ),
  CONSTRAINT articles_canonical_identity_url_shape_check CHECK (
    canonical_identity_url = btrim(canonical_identity_url)
    AND char_length(canonical_identity_url) BETWEEN 1 AND 8192
  ),
  CONSTRAINT articles_display_title_shape_check CHECK (
    display_title = btrim(display_title) AND char_length(display_title) BETWEEN 1 AND 2048
  ),
  CONSTRAINT articles_normalized_title_shape_check CHECK (
    normalized_title = btrim(normalized_title) AND char_length(normalized_title) BETWEEN 1 AND 2048
  ),
  CONSTRAINT articles_author_shape_check CHECK (
    author IS NULL OR (author = btrim(author) AND char_length(author) BETWEEN 1 AND 1024)
  ),
  CONSTRAINT articles_summary_shape_check CHECK (
    summary IS NULL OR (summary = btrim(summary) AND char_length(summary) BETWEEN 1 AND 32768)
  ),
  CONSTRAINT articles_image_url_shape_check CHECK (
    image_url IS NULL OR (image_url = btrim(image_url) AND char_length(image_url) BETWEEN 1 AND 8192)
  ),
  CONSTRAINT articles_language_shape_check CHECK (
    language IS NULL OR (language = btrim(language) AND char_length(language) BETWEEN 1 AND 128)
  ),
  CONSTRAINT articles_published_at_consistency_check CHECK (
    (published_at_status = 'parsed' AND published_at IS NOT NULL)
    OR (published_at_status IN ('missing', 'invalid') AND published_at IS NULL)
  ),
  CONSTRAINT articles_source_updated_at_consistency_check CHECK (
    (source_updated_at_status = 'parsed' AND source_updated_at IS NOT NULL)
    OR (source_updated_at_status IN ('missing', 'invalid') AND source_updated_at IS NULL)
  ),
  CONSTRAINT articles_seen_order_check CHECK (last_seen_at >= first_seen_at),
  CONSTRAINT articles_visibility_state_check CHECK (
    visibility_state IN ('visible', 'hidden', 'archived')
  )
);

CREATE UNIQUE INDEX articles_source_external_id_digest_unique
  ON articles (source_id, external_id_digest)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX articles_fallback_canonical_digest_unique
  ON articles (source_id, canonical_identity_digest)
  WHERE external_id IS NULL;

CREATE INDEX articles_canonical_identity_digest_lookup
  ON articles (source_id, canonical_identity_digest);

CREATE TABLE article_observations (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL,
  source_endpoint_id uuid NOT NULL,
  collection_run_id uuid NOT NULL,
  article_id uuid,
  observed_at timestamptz NOT NULL DEFAULT now(),
  processing_outcome text NOT NULL,
  observed_external_id text,
  observed_canonical_identity_url text,
  reason_code text,
  detail text,
  CONSTRAINT article_observations_source_endpoint_fk
    FOREIGN KEY (source_id, source_endpoint_id)
    REFERENCES source_endpoints (source_id, id),
  CONSTRAINT article_observations_endpoint_run_fk
    FOREIGN KEY (source_endpoint_id, collection_run_id)
    REFERENCES collection_runs (source_endpoint_id, id),
  CONSTRAINT article_observations_article_ownership_fk
    FOREIGN KEY (source_id, article_id)
    REFERENCES articles (source_id, id),
  CONSTRAINT article_observations_outcome_check CHECK (
    processing_outcome IN ('created', 'updated', 'unchanged', 'rejected', 'excluded', 'failed')
  ),
  CONSTRAINT article_observations_success_article_check CHECK (
    processing_outcome NOT IN ('created', 'updated', 'unchanged') OR article_id IS NOT NULL
  ),
  CONSTRAINT article_observations_external_id_shape_check CHECK (
    observed_external_id IS NULL
    OR (
      observed_external_id = btrim(observed_external_id)
      AND char_length(observed_external_id) BETWEEN 1 AND 2048
    )
  ),
  CONSTRAINT article_observations_canonical_url_shape_check CHECK (
    observed_canonical_identity_url IS NULL
    OR (
      observed_canonical_identity_url = btrim(observed_canonical_identity_url)
      AND char_length(observed_canonical_identity_url) BETWEEN 1 AND 8192
    )
  ),
  CONSTRAINT article_observations_reason_code_shape_check CHECK (
    reason_code IS NULL
    OR (
      char_length(reason_code) BETWEEN 1 AND 100
      AND reason_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  CONSTRAINT article_observations_detail_shape_check CHECK (
    detail IS NULL OR (detail = btrim(detail) AND char_length(detail) BETWEEN 1 AND 160)
  )
);
