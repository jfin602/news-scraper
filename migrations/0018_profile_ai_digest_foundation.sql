CREATE TABLE distribution_profile_ai_settings (
  profile_id uuid PRIMARY KEY REFERENCES distribution_profiles (id) ON DELETE CASCADE,
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_lookback_days integer NOT NULL DEFAULT 7,
  digest_max_article_count integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_profile_ai_settings_lookback_check CHECK (
    digest_lookback_days BETWEEN 1 AND 30
  ),
  CONSTRAINT distribution_profile_ai_settings_max_articles_check CHECK (
    digest_max_article_count BETWEEN 1 AND 20
  )
);

INSERT INTO distribution_profile_ai_settings (profile_id)
SELECT id FROM distribution_profiles;

CREATE FUNCTION create_distribution_profile_ai_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO distribution_profile_ai_settings (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER distribution_profiles_create_ai_settings
  AFTER INSERT ON distribution_profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_distribution_profile_ai_settings();

CREATE TABLE distribution_profile_digest_generations (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES distribution_profiles (id) ON DELETE CASCADE,
  digest_input_identity text NOT NULL,
  generated_at timestamptz NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_article_count integer NOT NULL,
  overview text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_profile_digest_generations_profile_id_unique UNIQUE (id, profile_id),
  CONSTRAINT distribution_profile_digest_generations_identity_check CHECK (
    digest_input_identity ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT distribution_profile_digest_generations_provider_check CHECK (
    provider = btrim(provider) AND char_length(provider) BETWEEN 1 AND 100
  ),
  CONSTRAINT distribution_profile_digest_generations_model_check CHECK (
    model = btrim(model) AND char_length(model) BETWEEN 1 AND 100
  ),
  CONSTRAINT distribution_profile_digest_generations_input_count_check CHECK (
    input_article_count BETWEEN 1 AND 20
  ),
  CONSTRAINT distribution_profile_digest_generations_overview_check CHECK (
    overview = btrim(overview) AND char_length(overview) BETWEEN 1 AND 2000
  )
);

CREATE TABLE distribution_profile_digest_inputs (
  generation_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  position integer NOT NULL,
  article_id uuid NOT NULL REFERENCES articles (id),
  CONSTRAINT distribution_profile_digest_inputs_generation_fk
    FOREIGN KEY (generation_id, profile_id)
    REFERENCES distribution_profile_digest_generations (id, profile_id)
    ON DELETE CASCADE,
  CONSTRAINT distribution_profile_digest_inputs_position_check CHECK (position BETWEEN 0 AND 19),
  CONSTRAINT distribution_profile_digest_inputs_position_unique UNIQUE (generation_id, position),
  CONSTRAINT distribution_profile_digest_inputs_article_unique UNIQUE (generation_id, article_id)
);

CREATE TABLE distribution_profile_digest_highlights (
  id uuid PRIMARY KEY,
  generation_id uuid NOT NULL REFERENCES distribution_profile_digest_generations (id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL,
  CONSTRAINT distribution_profile_digest_highlights_generation_id_unique UNIQUE (id, generation_id),
  CONSTRAINT distribution_profile_digest_highlights_position_check CHECK (position BETWEEN 0 AND 2),
  CONSTRAINT distribution_profile_digest_highlights_position_unique UNIQUE (generation_id, position),
  CONSTRAINT distribution_profile_digest_highlights_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 200
  ),
  CONSTRAINT distribution_profile_digest_highlights_explanation_check CHECK (
    explanation = btrim(explanation) AND char_length(explanation) BETWEEN 1 AND 500
  )
);

CREATE TABLE distribution_profile_digest_highlight_supports (
  highlight_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  position integer NOT NULL,
  article_id uuid NOT NULL,
  CONSTRAINT distribution_profile_digest_highlight_supports_highlight_fk
    FOREIGN KEY (highlight_id, generation_id)
    REFERENCES distribution_profile_digest_highlights (id, generation_id)
    ON DELETE CASCADE,
  CONSTRAINT distribution_profile_digest_highlight_supports_input_fk
    FOREIGN KEY (generation_id, article_id)
    REFERENCES distribution_profile_digest_inputs (generation_id, article_id),
  CONSTRAINT distribution_profile_digest_highlight_supports_position_check CHECK (position BETWEEN 0 AND 2),
  CONSTRAINT distribution_profile_digest_highlight_supports_position_unique UNIQUE (highlight_id, position),
  CONSTRAINT distribution_profile_digest_highlight_supports_article_unique UNIQUE (highlight_id, article_id)
);

CREATE TABLE distribution_profile_active_digests (
  profile_id uuid PRIMARY KEY REFERENCES distribution_profiles (id) ON DELETE CASCADE,
  generation_id uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_profile_active_digests_generation_fk
    FOREIGN KEY (generation_id, profile_id)
    REFERENCES distribution_profile_digest_generations (id, profile_id)
);

CREATE TABLE distribution_profile_digest_attempts (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES distribution_profiles (id) ON DELETE CASCADE,
  trigger_kind text NOT NULL,
  scheduled_slot timestamptz NULL,
  state text NOT NULL,
  terminal_outcome text NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  digest_input_identity text NULL,
  input_article_count integer NULL,
  failure_category text NULL,
  provider text NULL,
  model text NULL,
  url_context_succeeded_count integer NOT NULL DEFAULT 0,
  url_context_failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_profile_digest_attempts_trigger_check CHECK (
    trigger_kind IN ('scheduled', 'manual')
  ),
  CONSTRAINT distribution_profile_digest_attempts_slot_check CHECK (
    (trigger_kind = 'scheduled' AND scheduled_slot IS NOT NULL)
    OR (trigger_kind = 'manual' AND scheduled_slot IS NULL)
  ),
  CONSTRAINT distribution_profile_digest_attempts_state_check CHECK (
    state IN ('running', 'completed')
  ),
  CONSTRAINT distribution_profile_digest_attempts_terminal_check CHECK (
    (state = 'running' AND terminal_outcome IS NULL AND completed_at IS NULL)
    OR (state = 'completed' AND terminal_outcome IN ('success', 'skipped_no_input', 'skipped_unchanged', 'failed', 'abandoned') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT distribution_profile_digest_attempts_identity_check CHECK (
    digest_input_identity IS NULL OR digest_input_identity ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT distribution_profile_digest_attempts_input_count_check CHECK (
    input_article_count IS NULL OR input_article_count BETWEEN 0 AND 20
  ),
  CONSTRAINT distribution_profile_digest_attempts_failure_category_check CHECK (
    failure_category IS NULL OR failure_category IN ('provider_failure', 'timeout', 'rate_limit', 'malformed_output', 'safety_rejection', 'dependency_failure', 'abandoned')
  ),
  CONSTRAINT distribution_profile_digest_attempts_provider_check CHECK (
    provider IS NULL OR (provider = btrim(provider) AND char_length(provider) BETWEEN 1 AND 100)
  ),
  CONSTRAINT distribution_profile_digest_attempts_model_check CHECK (
    model IS NULL OR (model = btrim(model) AND char_length(model) BETWEEN 1 AND 100)
  ),
  CONSTRAINT distribution_profile_digest_attempts_url_context_succeeded_check CHECK (
    url_context_succeeded_count BETWEEN 0 AND 20
  ),
  CONSTRAINT distribution_profile_digest_attempts_url_context_failed_check CHECK (
    url_context_failed_count BETWEEN 0 AND 20
  )
);

CREATE UNIQUE INDEX distribution_profile_digest_attempts_scheduled_slot_unique
  ON distribution_profile_digest_attempts (profile_id, scheduled_slot)
  WHERE trigger_kind = 'scheduled';

CREATE UNIQUE INDEX distribution_profile_digest_attempts_one_running_per_profile
  ON distribution_profile_digest_attempts (profile_id)
  WHERE state = 'running';

CREATE FUNCTION reject_distribution_profile_digest_generation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'successful digest generations are immutable';
END;
$$;

CREATE TRIGGER distribution_profile_digest_generations_immutable
  BEFORE UPDATE ON distribution_profile_digest_generations
  FOR EACH ROW EXECUTE FUNCTION reject_distribution_profile_digest_generation_mutation();

CREATE TRIGGER distribution_profile_digest_inputs_immutable
  BEFORE UPDATE ON distribution_profile_digest_inputs
  FOR EACH ROW EXECUTE FUNCTION reject_distribution_profile_digest_generation_mutation();

CREATE TRIGGER distribution_profile_digest_highlights_immutable
  BEFORE UPDATE ON distribution_profile_digest_highlights
  FOR EACH ROW EXECUTE FUNCTION reject_distribution_profile_digest_generation_mutation();

CREATE TRIGGER distribution_profile_digest_highlight_supports_immutable
  BEFORE UPDATE ON distribution_profile_digest_highlight_supports
  FOR EACH ROW EXECUTE FUNCTION reject_distribution_profile_digest_generation_mutation();
