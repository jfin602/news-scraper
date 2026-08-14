ALTER TABLE sources
  ADD COLUMN priority integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT sources_priority_nonnegative_check CHECK (priority >= 0);

CREATE TABLE source_rss_atom_admission_phrases (
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  position integer NOT NULL,
  phrase text NOT NULL,
  CONSTRAINT source_rss_atom_admission_phrases_source_position_unique UNIQUE (
    source_id,
    position
  ),
  CONSTRAINT source_rss_atom_admission_phrases_position_check CHECK (position >= 0),
  CONSTRAINT source_rss_atom_admission_phrases_phrase_shape_check CHECK (
    phrase = btrim(phrase)
    AND char_length(phrase) BETWEEN 1 AND 512
    AND phrase !~ '[[:cntrl:]]'
  )
);

ALTER TABLE collection_runs
  ADD COLUMN source_item_filtered_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT collection_runs_source_item_filtered_count_check CHECK (
    source_item_filtered_count >= 0
    AND source_item_filtered_count <= raw_item_count
  ),
  DROP CONSTRAINT collection_runs_normalization_arithmetic_check,
  ADD CONSTRAINT collection_runs_normalization_arithmetic_check CHECK (
    normalization_status <> 'succeeded'
    OR raw_item_count = source_item_filtered_count
      + normalized_candidate_count
      + normalization_failure_count
  );
