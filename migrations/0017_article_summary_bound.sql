UPDATE articles
SET summary = CASE
  WHEN substring(summary FROM 3997 FOR 1) ~ '[[:space:]]' THEN
    regexp_replace(substring(summary FROM 1 FOR 3997), '[[:space:]]+$', '') || '...'
  WHEN substring(summary FROM 3998 FOR 1) ~ '[[:space:]]' THEN
    substring(summary FROM 1 FOR 3997) || '...'
  WHEN substring(summary FROM 1 FOR 3997) ~ '[[:space:]]' THEN
    regexp_replace(
      substring(summary FROM 1 FOR 3997),
      '[[:space:]][^[:space:]]*$',
      ''
    ) || '...'
  ELSE substring(summary FROM 1 FOR 3997) || '...'
END
WHERE summary IS NOT NULL AND char_length(summary) > 4000;

ALTER TABLE articles
  DROP CONSTRAINT articles_summary_shape_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_summary_shape_check CHECK (
    summary IS NULL OR (summary = btrim(summary) AND char_length(summary) BETWEEN 1 AND 4000)
  );
