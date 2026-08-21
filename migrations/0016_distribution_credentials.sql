CREATE TABLE distribution_credentials (
  id uuid PRIMARY KEY,
  lookup_id text NOT NULL,
  verifier bytea NOT NULL,
  label text NOT NULL,
  capability text NOT NULL DEFAULT 'distribution:read',
  expires_at timestamptz,
  revoked_at timestamptz,
  rotation_successor_id uuid REFERENCES distribution_credentials (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_credentials_lookup_id_unique UNIQUE (lookup_id),
  CONSTRAINT distribution_credentials_lookup_id_shape_check CHECK (
    lookup_id ~ '^l[A-Za-z0-9_-]{22}$'
  ),
  CONSTRAINT distribution_credentials_verifier_length_check CHECK (
    octet_length(verifier) = 32
  ),
  CONSTRAINT distribution_credentials_label_shape_check CHECK (
    label = btrim(label)
    AND char_length(label) BETWEEN 1 AND 200
    AND label !~ '[[:cntrl:]]'
  ),
  CONSTRAINT distribution_credentials_capability_check CHECK (
    capability = 'distribution:read'
  ),
  CONSTRAINT distribution_credentials_rotation_successor_distinct_check CHECK (
    rotation_successor_id IS NULL OR rotation_successor_id <> id
  ),
  CONSTRAINT distribution_credentials_rotation_successor_unique UNIQUE (rotation_successor_id)
);

CREATE FUNCTION reject_distribution_credential_lookup_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lookup_id IS DISTINCT FROM OLD.lookup_id THEN
    RAISE EXCEPTION 'lookup_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER distribution_credentials_lookup_id_immutable
  BEFORE UPDATE ON distribution_credentials
  FOR EACH ROW
  EXECUTE FUNCTION reject_distribution_credential_lookup_id_change();
