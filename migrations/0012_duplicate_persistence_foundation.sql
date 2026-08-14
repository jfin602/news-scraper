-- Phase 16 P1: durable duplicate review/grouping relationships remain
-- installation-wide because a deployment contains one Publication.

ALTER TABLE collection_runs
  ADD COLUMN duplicate_review_created_count integer NOT NULL DEFAULT 0,
  ADD COLUMN duplicate_grouped_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT collection_runs_duplicate_review_created_count_check
    CHECK (duplicate_review_created_count >= 0),
  ADD CONSTRAINT collection_runs_duplicate_grouped_count_check
    CHECK (duplicate_grouped_count >= 0);

-- Candidate fingerprints are lowercase SHA-256 hex values. Keeping the
-- fingerprint separate from normalized signal rows lets later evaluation
-- distinguish materially changed deterministic evidence without retaining
-- Article bodies or opaque unbounded JSON.
CREATE TABLE duplicate_review_candidates (
  id uuid PRIMARY KEY,
  article_low_id uuid NOT NULL REFERENCES articles (id) ON DELETE RESTRICT,
  article_high_id uuid NOT NULL REFERENCES articles (id) ON DELETE RESTRICT,
  state text NOT NULL,
  origin text NOT NULL,
  confidence smallint NOT NULL,
  evidence_fingerprint text NOT NULL,
  manual_decided_at timestamptz,
  manual_decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_review_candidates_pair_order_check CHECK (
    article_low_id < article_high_id
  ),
  CONSTRAINT duplicate_review_candidates_pair_unique UNIQUE (
    article_low_id,
    article_high_id
  ),
  CONSTRAINT duplicate_review_candidates_state_check CHECK (
    state IN ('pending', 'dismissed', 'merged', 'superseded')
  ),
  CONSTRAINT duplicate_review_candidates_origin_check CHECK (
    origin IN ('automatic', 'manual')
  ),
  CONSTRAINT duplicate_review_candidates_confidence_check CHECK (
    confidence BETWEEN 0 AND 100
  ),
  CONSTRAINT duplicate_review_candidates_fingerprint_shape_check CHECK (
    evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT duplicate_review_candidates_manual_reason_shape_check CHECK (
    manual_decision_reason IS NULL
    OR (
      manual_decision_reason = btrim(manual_decision_reason)
      AND char_length(manual_decision_reason) BETWEEN 1 AND 2000
    )
  )
);

CREATE TABLE duplicate_review_signals (
  candidate_id uuid NOT NULL
    REFERENCES duplicate_review_candidates (id) ON DELETE CASCADE,
  signal_order smallint NOT NULL,
  reason_code text NOT NULL,
  signal_strength text NOT NULL,
  CONSTRAINT duplicate_review_signals_pkey PRIMARY KEY (candidate_id, signal_order),
  CONSTRAINT duplicate_review_signals_order_check CHECK (
    signal_order BETWEEN 1 AND 32
  ),
  CONSTRAINT duplicate_review_signals_reason_shape_check CHECK (
    char_length(reason_code) BETWEEN 1 AND 100
    AND reason_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT duplicate_review_signals_strength_check CHECK (
    signal_strength IN ('strong', 'weak')
  )
);

CREATE TABLE duplicate_groups (
  id uuid PRIMARY KEY,
  primary_article_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE duplicate_group_memberships (
  group_id uuid NOT NULL
    REFERENCES duplicate_groups (id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_group_memberships_pkey PRIMARY KEY (group_id, article_id),
  CONSTRAINT duplicate_group_memberships_article_unique UNIQUE (article_id)
);

-- Deferred membership ownership permits a group and its first membership to
-- be created in one transaction, while preventing a committed non-member
-- Primary. The group row remains the sole Primary authority.
ALTER TABLE duplicate_groups
  ADD CONSTRAINT duplicate_groups_primary_membership_fk
  FOREIGN KEY (id, primary_article_id)
  REFERENCES duplicate_group_memberships (group_id, article_id)
  DEFERRABLE INITIALLY DEFERRED;

-- Existing Source-scoped identity indexes remain unchanged. These digest
-- lookups support later cross-Source exact-string verification.
CREATE INDEX articles_canonical_identity_global_digest_lookup
  ON articles (canonical_identity_digest);

CREATE INDEX articles_normalized_title_digest_lookup
  ON articles (sha256(normalized_title::bytea));
