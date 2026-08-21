ALTER TABLE study_plans ADD COLUMN archived_at TEXT;
ALTER TABLE study_plans ADD COLUMN deleted_at TEXT;

CREATE INDEX study_plans_user_available_idx
  ON study_plans(user_id, active DESC, created_at, name)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX study_plans_user_archived_idx
  ON study_plans(user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
