CREATE TABLE categories (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_config_key_unique UNIQUE (config_key),
  CONSTRAINT categories_config_key_shape_check CHECK (
    char_length(config_key) BETWEEN 1 AND 100
    AND config_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT categories_display_name_shape_check CHECK (
    display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200
  )
);

CREATE TABLE relevance_rules (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  source_id uuid REFERENCES sources (id),
  predicate_type text NOT NULL,
  pattern text NOT NULL,
  action text NOT NULL,
  category_id uuid REFERENCES categories (id),
  priority integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relevance_rules_config_key_unique UNIQUE (config_key),
  CONSTRAINT relevance_rules_id_category_id_unique UNIQUE (id, category_id),
  CONSTRAINT relevance_rules_config_key_shape_check CHECK (
    char_length(config_key) BETWEEN 1 AND 100
    AND config_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT relevance_rules_predicate_type_check CHECK (
    predicate_type IN ('title_contains', 'summary_contains', 'source_category_equals')
  ),
  CONSTRAINT relevance_rules_pattern_shape_check CHECK (
    pattern = btrim(pattern) AND char_length(pattern) BETWEEN 1 AND 2000
  ),
  CONSTRAINT relevance_rules_action_check CHECK (
    action IN ('include', 'exclude', 'categorize')
  ),
  CONSTRAINT relevance_rules_category_target_check CHECK (
    (action = 'categorize' AND category_id IS NOT NULL)
    OR (action IN ('include', 'exclude') AND category_id IS NULL)
  ),
  CONSTRAINT relevance_rules_reason_shape_check CHECK (
    reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 160
  )
);

CREATE FUNCTION reject_category_or_relevance_config_key_change()
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

CREATE TRIGGER categories_config_key_immutable
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION reject_category_or_relevance_config_key_change();

CREATE TRIGGER relevance_rules_config_key_immutable
  BEFORE UPDATE ON relevance_rules
  FOR EACH ROW
  EXECUTE FUNCTION reject_category_or_relevance_config_key_change();

ALTER TABLE sources
  ADD COLUMN default_category_id uuid REFERENCES categories (id);

ALTER TABLE source_endpoints
  ADD COLUMN default_category_id uuid REFERENCES categories (id);

CREATE TABLE article_categories (
  article_id uuid NOT NULL REFERENCES articles (id),
  category_id uuid NOT NULL REFERENCES categories (id),
  CONSTRAINT article_categories_article_category_unique UNIQUE (article_id, category_id)
);

ALTER TABLE article_observations
  ADD COLUMN relevance_rule_id uuid REFERENCES relevance_rules (id);

CREATE TABLE article_observation_category_reasons (
  article_observation_id uuid NOT NULL REFERENCES article_observations (id),
  category_id uuid NOT NULL REFERENCES categories (id),
  relevance_rule_id uuid,
  reason_position integer NOT NULL,
  reason_kind text NOT NULL,
  reason_detail text NOT NULL,
  CONSTRAINT article_observation_category_reasons_rule_category_fk
    FOREIGN KEY (relevance_rule_id, category_id)
    REFERENCES relevance_rules (id, category_id),
  CONSTRAINT article_observation_category_reasons_observation_position_unique UNIQUE (
    article_observation_id,
    reason_position
  ),
  CONSTRAINT article_observation_category_reasons_position_check CHECK (
    reason_position >= 1
  ),
  CONSTRAINT article_observation_category_reasons_kind_rule_check CHECK (
    (reason_kind = 'rule' AND relevance_rule_id IS NOT NULL)
    OR (
      reason_kind IN ('endpoint_default', 'source_default')
      AND relevance_rule_id IS NULL
    )
  ),
  CONSTRAINT article_observation_category_reasons_detail_shape_check CHECK (
    reason_detail = btrim(reason_detail)
    AND char_length(reason_detail) BETWEEN 1 AND 160
  )
);
