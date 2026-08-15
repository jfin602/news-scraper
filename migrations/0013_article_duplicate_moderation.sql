-- Phase 17 P1: bounded persistence for reversible Article and duplicate
-- moderation. These tables store operator authority; later prompts own the
-- transactional commands and read models that consume it.

ALTER TABLE articles
  ADD COLUMN display_title_override text,
  ADD CONSTRAINT articles_display_title_override_shape_check CHECK (
    display_title_override IS NULL
    OR (
      display_title_override = btrim(display_title_override)
      AND char_length(display_title_override) BETWEEN 1 AND 2048
    )
  );

CREATE TABLE article_category_overrides (
  article_id uuid PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE article_category_override_memberships (
  article_id uuid NOT NULL REFERENCES article_category_overrides (article_id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT article_category_override_memberships_pkey PRIMARY KEY (article_id, category_id)
);

CREATE INDEX article_category_override_memberships_category_lookup
  ON article_category_override_memberships (category_id, article_id);

CREATE TABLE duplicate_manual_separations (
  article_low_id uuid NOT NULL REFERENCES articles (id) ON DELETE RESTRICT,
  article_high_id uuid NOT NULL REFERENCES articles (id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  CONSTRAINT duplicate_manual_separations_pkey PRIMARY KEY (article_low_id, article_high_id),
  CONSTRAINT duplicate_manual_separations_pair_order_check CHECK (
    article_low_id < article_high_id
  ),
  CONSTRAINT duplicate_manual_separations_reason_shape_check CHECK (
    reason IS NULL OR (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000)
  )
);

CREATE INDEX duplicate_manual_separations_high_article_lookup
  ON duplicate_manual_separations (article_high_id, article_low_id);

ALTER TABLE duplicate_groups
  ADD COLUMN primary_selection_origin text NOT NULL DEFAULT 'automatic',
  ADD CONSTRAINT duplicate_groups_primary_selection_origin_check CHECK (
    primary_selection_origin IN ('automatic', 'manual')
  );

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  prior_state jsonb,
  new_state jsonb,
  CONSTRAINT audit_events_action_shape_check CHECK (
    char_length(action) BETWEEN 1 AND 100
    AND action = btrim(action)
    AND action ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT audit_events_target_type_shape_check CHECK (
    char_length(target_type) BETWEEN 1 AND 100
    AND target_type = btrim(target_type)
    AND target_type ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT audit_events_reason_shape_check CHECK (
    reason IS NULL OR (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT audit_events_prior_state_shape_check CHECK (
    prior_state IS NULL OR (jsonb_typeof(prior_state) = 'object' AND char_length(prior_state::text) <= 32768)
  ),
  CONSTRAINT audit_events_new_state_shape_check CHECK (
    new_state IS NULL OR (jsonb_typeof(new_state) = 'object' AND char_length(new_state::text) <= 32768)
  )
);

CREATE INDEX audit_events_target_history_lookup
  ON audit_events (target_type, target_id, occurred_at DESC, id DESC);
