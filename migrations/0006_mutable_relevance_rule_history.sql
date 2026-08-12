ALTER TABLE article_observation_category_reasons
  DROP CONSTRAINT article_observation_category_reasons_rule_category_fk;

ALTER TABLE relevance_rules
  DROP CONSTRAINT relevance_rules_id_category_id_unique;

ALTER TABLE article_observation_category_reasons
  ADD CONSTRAINT article_observation_category_reasons_rule_fk
  FOREIGN KEY (relevance_rule_id) REFERENCES relevance_rules (id);

CREATE FUNCTION validate_observation_category_reason_rule_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.relevance_rule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM relevance_rules rule
    WHERE rule.id = NEW.relevance_rule_id
      AND rule.action = 'categorize'
      AND rule.category_id = NEW.category_id
  ) THEN
    RAISE EXCEPTION 'observation Category reason rule target mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER article_observation_category_reasons_rule_target
  BEFORE INSERT OR UPDATE OF relevance_rule_id, category_id
  ON article_observation_category_reasons
  FOR EACH ROW
  EXECUTE FUNCTION validate_observation_category_reason_rule_target();
