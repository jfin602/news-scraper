ALTER TABLE publication_settings
  ADD COLUMN description text,
  ADD COLUMN logo_path text,
  ADD COLUMN accent_color text,
  ADD CONSTRAINT publication_settings_description_shape_check CHECK (
    description IS NULL
    OR (
      description = btrim(description)
      AND description !~ '^[[:space:]]'
      AND description !~ '[[:space:]]$'
      AND char_length(description) BETWEEN 1 AND 500
    )
  ),
  ADD CONSTRAINT publication_settings_logo_path_shape_check CHECK (
    logo_path IS NULL
    OR (
      logo_path = btrim(logo_path)
      AND logo_path !~ '^[[:space:]]'
      AND logo_path !~ '[[:space:]]$'
      AND char_length(logo_path) BETWEEN 1 AND 1024
      AND left(logo_path, 1) = '/'
      AND left(logo_path, 2) <> '//'
      AND position('?' IN logo_path) = 0
      AND position('#' IN logo_path) = 0
      AND position(chr(92) IN logo_path) = 0
      AND logo_path !~ '[[:cntrl:]]'
    )
  ),
  ADD CONSTRAINT publication_settings_accent_color_shape_check CHECK (
    accent_color IS NULL OR accent_color ~ '^#[0-9A-F]{6}$'
  );
