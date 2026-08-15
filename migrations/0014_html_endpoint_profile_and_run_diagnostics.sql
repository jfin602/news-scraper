ALTER TABLE source_endpoints
  DROP CONSTRAINT source_endpoints_type_check,
  ADD COLUMN html_listing_profile jsonb,
  ADD COLUMN html_listing_profile_revision integer,
  ADD CONSTRAINT source_endpoints_type_check CHECK (
    endpoint_type IN ('rss_atom', 'html_listing')
  ),
  ADD CONSTRAINT source_endpoints_html_listing_profile_check CHECK (
    (endpoint_type = 'rss_atom'
      AND html_listing_profile IS NULL
      AND html_listing_profile_revision IS NULL)
    OR
    (endpoint_type = 'html_listing'
      AND jsonb_typeof(html_listing_profile) = 'object'
      AND octet_length(html_listing_profile::text) <= 16384
      AND html_listing_profile_revision >= 1)
  );

ALTER TABLE collection_runs
  ADD COLUMN parser_kind text,
  ADD COLUMN parser_version text,
  ADD COLUMN html_listing_profile_revision integer,
  ADD COLUMN parser_item_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN parser_diagnostic_code text,
  ADD COLUMN parser_diagnostic_detail text,
  ADD CONSTRAINT collection_runs_parser_kind_check CHECK (
    parser_kind IS NULL OR parser_kind IN ('rss_atom', 'html_listing')
  ),
  ADD CONSTRAINT collection_runs_parser_version_shape_check CHECK (
    parser_version IS NULL OR (
      parser_version = btrim(parser_version)
      AND char_length(parser_version) BETWEEN 1 AND 100
    )
  ),
  ADD CONSTRAINT collection_runs_html_listing_profile_revision_check CHECK (
    html_listing_profile_revision IS NULL OR html_listing_profile_revision >= 1
  ),
  ADD CONSTRAINT collection_runs_parser_item_failure_count_check CHECK (
    parser_item_failure_count BETWEEN 0 AND 250
  ),
  ADD CONSTRAINT collection_runs_parser_diagnostic_code_check CHECK (
    parser_diagnostic_code IS NULL OR (
      char_length(parser_diagnostic_code) BETWEEN 1 AND 100
      AND parser_diagnostic_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    )
  ),
  ADD CONSTRAINT collection_runs_parser_diagnostic_detail_check CHECK (
    parser_diagnostic_detail IS NULL OR (
      parser_diagnostic_detail = btrim(parser_diagnostic_detail)
      AND char_length(parser_diagnostic_detail) BETWEEN 1 AND 160
    )
  ),
  ADD CONSTRAINT collection_runs_parser_diagnostics_consistency_check CHECK (
    (parser_status = 'not_run'
      AND parser_kind IS NULL AND parser_version IS NULL
      AND html_listing_profile_revision IS NULL
      AND parser_item_failure_count = 0
      AND parser_diagnostic_code IS NULL AND parser_diagnostic_detail IS NULL)
    OR
    (parser_status IN ('succeeded', 'failed') AND parser_kind IS NULL
      AND parser_version IS NULL AND html_listing_profile_revision IS NULL
      AND parser_item_failure_count = 0
      AND parser_diagnostic_code IS NULL AND parser_diagnostic_detail IS NULL)
    OR
    (parser_status IN ('succeeded', 'failed')
      AND parser_kind IS NOT NULL AND parser_version IS NOT NULL
      AND ((parser_kind = 'rss_atom' AND html_listing_profile_revision IS NULL)
        OR (parser_kind = 'html_listing' AND html_listing_profile_revision >= 1)))
  );
