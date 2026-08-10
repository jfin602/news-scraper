ALTER TABLE sources
  ADD CONSTRAINT sources_publication_id_id_unique UNIQUE (publication_id, id);

ALTER TABLE source_endpoints
  ADD CONSTRAINT source_endpoints_source_id_id_unique UNIQUE (source_id, id);

ALTER TABLE collection_runs
  ADD CONSTRAINT collection_runs_endpoint_id_id_unique UNIQUE (source_endpoint_id, id);

CREATE TABLE articles (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT articles_publication_source_fk FOREIGN KEY (publication_id, source_id)
    REFERENCES sources (publication_id, id),
  CONSTRAINT articles_publication_source_id_unique UNIQUE (publication_id, source_id, id),
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
  CONSTRAINT articles_seen_order_check CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX articles_source_external_id_digest_unique
  ON articles (source_id, external_id_digest)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX articles_fallback_canonical_digest_unique
  ON articles (publication_id, source_id, canonical_identity_digest)
  WHERE external_id IS NULL;

CREATE INDEX articles_canonical_identity_digest_lookup
  ON articles (canonical_identity_digest);

CREATE TABLE article_observations (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL,
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
  CONSTRAINT article_observations_publication_source_fk
    FOREIGN KEY (publication_id, source_id)
    REFERENCES sources (publication_id, id),
  CONSTRAINT article_observations_source_endpoint_fk
    FOREIGN KEY (source_id, source_endpoint_id)
    REFERENCES source_endpoints (source_id, id),
  CONSTRAINT article_observations_endpoint_run_fk
    FOREIGN KEY (source_endpoint_id, collection_run_id)
    REFERENCES collection_runs (source_endpoint_id, id),
  CONSTRAINT article_observations_article_ownership_fk
    FOREIGN KEY (publication_id, source_id, article_id)
    REFERENCES articles (publication_id, source_id, id),
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
