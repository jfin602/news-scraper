CREATE TABLE distribution_profiles (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  display_name text NOT NULL,
  lifecycle text NOT NULL DEFAULT 'draft',
  result_limit integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_profiles_config_key_unique UNIQUE (config_key),
  CONSTRAINT distribution_profiles_config_key_shape_check CHECK (
    char_length(config_key) BETWEEN 1 AND 100
    AND config_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT distribution_profiles_display_name_shape_check CHECK (
    display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT distribution_profiles_lifecycle_check CHECK (
    lifecycle IN ('draft', 'active', 'disabled')
  ),
  CONSTRAINT distribution_profiles_result_limit_check CHECK (
    result_limit BETWEEN 1 AND 1000
  )
);

CREATE FUNCTION reject_distribution_profile_config_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.config_key IS DISTINCT FROM OLD.config_key THEN
    RAISE EXCEPTION 'config_key is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER distribution_profiles_config_key_immutable
  BEFORE UPDATE ON distribution_profiles
  FOR EACH ROW
  EXECUTE FUNCTION reject_distribution_profile_config_key_change();

CREATE TABLE distribution_profile_sources (
  profile_id uuid NOT NULL REFERENCES distribution_profiles (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources (id),
  CONSTRAINT distribution_profile_sources_profile_source_unique UNIQUE (profile_id, source_id)
);

CREATE TABLE distribution_profile_source_phrases (
  profile_id uuid NOT NULL,
  source_id uuid NOT NULL,
  phrase_kind text NOT NULL,
  position integer NOT NULL,
  phrase text NOT NULL,
  CONSTRAINT distribution_profile_source_phrases_association_fk
    FOREIGN KEY (profile_id, source_id)
    REFERENCES distribution_profile_sources (profile_id, source_id)
    ON DELETE CASCADE,
  CONSTRAINT distribution_profile_source_phrases_kind_check CHECK (
    phrase_kind IN ('include', 'exclude')
  ),
  CONSTRAINT distribution_profile_source_phrases_position_check CHECK (
    position BETWEEN 0 AND 63
  ),
  CONSTRAINT distribution_profile_source_phrases_phrase_shape_check CHECK (
    phrase = btrim(phrase)
    AND char_length(phrase) BETWEEN 1 AND 512
    AND phrase !~ '[[:cntrl:]]'
  ),
  CONSTRAINT distribution_profile_source_phrases_position_unique UNIQUE (
    profile_id, source_id, phrase_kind, position
  )
);

CREATE UNIQUE INDEX distribution_profile_source_phrases_case_insensitive_unique
  ON distribution_profile_source_phrases (
    profile_id, source_id, phrase_kind, lower(phrase)
  );

CREATE TABLE distribution_profile_source_categories (
  profile_id uuid NOT NULL,
  source_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES categories (id),
  position integer NOT NULL,
  CONSTRAINT distribution_profile_source_categories_association_fk
    FOREIGN KEY (profile_id, source_id)
    REFERENCES distribution_profile_sources (profile_id, source_id)
    ON DELETE CASCADE,
  CONSTRAINT distribution_profile_source_categories_position_check CHECK (
    position BETWEEN 0 AND 63
  ),
  CONSTRAINT distribution_profile_source_categories_position_unique UNIQUE (
    profile_id, source_id, position
  ),
  CONSTRAINT distribution_profile_source_categories_category_unique UNIQUE (
    profile_id, source_id, category_id
  )
);
