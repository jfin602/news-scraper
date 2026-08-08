CREATE TABLE publications (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  active_for_collection boolean NOT NULL,
  public_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publications_slug_unique UNIQUE (slug),
  CONSTRAINT publications_name_shape_check CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 1 AND 200
  ),
  CONSTRAINT publications_slug_shape_check CHECK (
    char_length(slug) BETWEEN 1 AND 100
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT publications_public_status_check CHECK (
    public_status IN ('private', 'public')
  )
);

CREATE TABLE sources (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL REFERENCES publications (id),
  config_key text NOT NULL,
  display_name text NOT NULL,
  site_url text NOT NULL,
  approval_state text NOT NULL,
  lifecycle_state text NOT NULL,
  operational_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_publication_config_key_unique UNIQUE (publication_id, config_key),
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
