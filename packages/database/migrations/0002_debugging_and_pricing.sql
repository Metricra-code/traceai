ALTER TABLE traces ADD COLUMN error_capture_policy TEXT;
ALTER TABLE model_pricing ADD COLUMN verified_at TEXT;
ALTER TABLE model_pricing ADD COLUMN billing_basis TEXT;

-- Managed registry imports are immutable and race-safe; historical trace costs are never rewritten.
-- Parenthesized CASE avoids D1 /query confusing CASE END with trigger END (workers-sdk #4727).
CREATE TRIGGER pricing_registry_insert_guard BEFORE INSERT ON model_pricing
WHEN NEW.verified_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM model_pricing old WHERE old.id = NEW.id AND (
      old.provider IS NOT NEW.provider OR old.model IS NOT NEW.model OR
      old.input_nano_usd_per_million IS NOT NEW.input_nano_usd_per_million OR
      old.output_nano_usd_per_million IS NOT NEW.output_nano_usd_per_million OR
      old.currency IS NOT NEW.currency OR old.effective_from IS NOT NEW.effective_from OR
      old.effective_to IS NOT NEW.effective_to OR old.source_url IS NOT NEW.source_url OR
      old.simulated IS NOT NEW.simulated OR old.verified_at IS NOT NEW.verified_at OR
      old.billing_basis IS NOT NEW.billing_basis
    )
  ) THEN RAISE(ABORT, 'pricing_version_immutable') END);
  SELECT (CASE WHEN NEW.simulated != 0 OR NEW.currency != 'USD' OR
    NEW.billing_basis IS NOT 'base-text-global' OR NEW.effective_from < NEW.verified_at OR
    (NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from)
    THEN RAISE(ABORT, 'invalid_pricing_registry_entry') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM model_pricing old WHERE old.id != NEW.id AND old.simulated = 0 AND
      old.provider = NEW.provider AND old.model = NEW.model AND old.currency = NEW.currency AND
      julianday(old.effective_from) < julianday(COALESCE(NEW.effective_to, '9999-12-31T23:59:59.999Z')) AND
      julianday(NEW.effective_from) < julianday(COALESCE(old.effective_to, '9999-12-31T23:59:59.999Z'))
  ) THEN RAISE(ABORT, 'pricing_window_overlap') END);
END;

CREATE TRIGGER pricing_registry_delete_guard BEFORE DELETE ON model_pricing
WHEN OLD.verified_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'pricing_version_immutable');
END;

CREATE TRIGGER pricing_registry_update_guard BEFORE UPDATE ON model_pricing
WHEN OLD.verified_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN OLD.id IS NOT NEW.id OR OLD.provider IS NOT NEW.provider OR
    OLD.model IS NOT NEW.model OR OLD.input_nano_usd_per_million IS NOT NEW.input_nano_usd_per_million OR
    OLD.output_nano_usd_per_million IS NOT NEW.output_nano_usd_per_million OR
    OLD.currency IS NOT NEW.currency OR OLD.effective_from IS NOT NEW.effective_from OR
    OLD.effective_to IS NOT NEW.effective_to OR OLD.source_url IS NOT NEW.source_url OR
    OLD.simulated IS NOT NEW.simulated OR OLD.verified_at IS NOT NEW.verified_at OR
    OLD.billing_basis IS NOT NEW.billing_basis THEN RAISE(ABORT, 'pricing_version_immutable') END);
END;
