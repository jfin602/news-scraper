ALTER TABLE articles
  ADD COLUMN visibility_state text NOT NULL DEFAULT 'visible',
  ADD CONSTRAINT articles_visibility_state_check CHECK (
    visibility_state IN ('visible', 'hidden', 'archived')
  );
