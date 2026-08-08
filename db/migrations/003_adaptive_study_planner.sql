CREATE TABLE study_plan_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  study_plan_id TEXT NOT NULL,
  availability_json TEXT NOT NULL,
  session_minutes INTEGER NOT NULL DEFAULT 45 CHECK (session_minutes IN (30, 45, 60, 90)),
  daily_limit_minutes INTEGER NOT NULL DEFAULT 180 CHECK (daily_limit_minutes BETWEEN 30 AND 720),
  first_review_days INTEGER NOT NULL DEFAULT 2 CHECK (first_review_days BETWEEN 1 AND 90),
  second_review_days INTEGER NOT NULL DEFAULT 6 CHECK (second_review_days BETWEEN 2 AND 180),
  reinforcement_days INTEGER NOT NULL DEFAULT 10 CHECK (reinforcement_days BETWEEN 3 AND 365),
  exercise_questions INTEGER NOT NULL DEFAULT 20 CHECK (exercise_questions IN (10, 20, 30, 50)),
  last_incidence_signature TEXT,
  last_generated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, study_plan_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (study_plan_id, user_id) REFERENCES study_plans(id, user_id) ON DELETE CASCADE
);

ALTER TABLE activities
  ADD COLUMN planning_origin TEXT NOT NULL DEFAULT 'manual' CHECK (planning_origin IN ('manual', 'incidence', 'performance'));
ALTER TABLE activities ADD COLUMN focus_label TEXT;
ALTER TABLE activities ADD COLUMN subtopic_text TEXT;
ALTER TABLE activities ADD COLUMN sequence_key TEXT;
ALTER TABLE activities ADD COLUMN sequence_step TEXT;
ALTER TABLE activities ADD COLUMN adaptive_reason TEXT;
ALTER TABLE activities ADD COLUMN planner_error_reason TEXT CHECK (planner_error_reason IS NULL OR planner_error_reason IN ('did_not_know', 'forgot', 'confused_concepts', 'interpretation', 'inattention', 'other'));
ALTER TABLE activities ADD COLUMN base_weight REAL;
ALTER TABLE activities ADD COLUMN adaptive_weight REAL;

CREATE UNIQUE INDEX activities_planner_sequence_idx
  ON activities(user_id, study_plan_id, sequence_key, sequence_step)
  WHERE sequence_key IS NOT NULL AND sequence_step IS NOT NULL;
CREATE INDEX activities_planner_future_idx
  ON activities(user_id, study_plan_id, planning_origin, scheduled_date, status);
