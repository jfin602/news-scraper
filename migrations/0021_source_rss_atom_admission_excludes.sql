ALTER TABLE source_rss_atom_admission_phrases
  DROP CONSTRAINT source_rss_atom_admission_phrases_position_check,
  ADD CONSTRAINT source_rss_atom_admission_phrases_position_check CHECK (
    position BETWEEN 0 AND 63
  );

CREATE TABLE source_rss_atom_admission_exclude_phrases (
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  position integer NOT NULL,
  phrase text NOT NULL,
  CONSTRAINT source_rss_atom_admission_exclude_phrases_source_position_unique UNIQUE (
    source_id,
    position
  ),
  CONSTRAINT source_rss_atom_admission_exclude_phrases_position_check CHECK (
    position BETWEEN 0 AND 63
  ),
  CONSTRAINT source_rss_atom_admission_exclude_phrases_phrase_shape_check CHECK (
    phrase = btrim(phrase)
    AND char_length(phrase) BETWEEN 1 AND 512
    AND phrase !~ '[[:cntrl:]]'
  )
);
