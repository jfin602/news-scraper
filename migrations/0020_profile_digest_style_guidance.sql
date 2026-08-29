ALTER TABLE distribution_profile_ai_settings
  ADD COLUMN digest_style_guidance text NULL,
  ADD CONSTRAINT distribution_profile_ai_settings_digest_style_guidance_check CHECK (
    digest_style_guidance IS NULL
    OR (
      char_length(digest_style_guidance) BETWEEN 1 AND 500
      AND digest_style_guidance !~ '^[[:space:]]*$'
    )
  );
