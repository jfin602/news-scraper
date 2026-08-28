ALTER TABLE distribution_profile_digest_attempts
  DROP CONSTRAINT distribution_profile_digest_attempts_terminal_check;

ALTER TABLE distribution_profile_digest_attempts
  ADD CONSTRAINT distribution_profile_digest_attempts_terminal_check CHECK (
    (state = 'running' AND terminal_outcome IS NULL AND completed_at IS NULL)
    OR (
      state = 'completed'
      AND terminal_outcome IN (
        'success',
        'skipped_disabled',
        'skipped_no_input',
        'skipped_unchanged',
        'failed',
        'abandoned'
      )
      AND completed_at IS NOT NULL
    )
  );
