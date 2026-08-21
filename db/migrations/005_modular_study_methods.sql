ALTER TABLE study_plans
  ADD COLUMN study_mode TEXT NOT NULL DEFAULT 'advanced'
  CHECK (study_mode IN ('basic', 'advanced'));

UPDATE study_plans SET study_mode = 'advanced' WHERE study_mode IS NULL;

UPDATE activities
SET study_plan_id = (
  SELECT plans.id
  FROM study_plans plans
  WHERE plans.user_id = activities.user_id
  ORDER BY plans.active DESC, plans.created_at, plans.id
  LIMIT 1
)
WHERE study_plan_id IS NULL
  AND EXISTS (SELECT 1 FROM study_plans plans WHERE plans.user_id = activities.user_id);

CREATE TABLE activities_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  study_plan_id TEXT,
  subject_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('study', 'exercise', 'review', 'reinforcement')),
  scheduled_date TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  question_count INTEGER CHECK (question_count IS NULL OR question_count > 0),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'attention', 'completed', 'not_done')),
  exercise_origin TEXT NOT NULL DEFAULT 'manual' CHECK (exercise_origin IN ('manual', 'question_bank')),
  linked_study_activity_id TEXT,
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  planning_origin TEXT NOT NULL DEFAULT 'manual' CHECK (planning_origin IN ('manual', 'incidence', 'performance')),
  focus_label TEXT,
  subtopic_text TEXT,
  sequence_key TEXT,
  sequence_step TEXT,
  adaptive_reason TEXT,
  planner_error_reason TEXT CHECK (planner_error_reason IS NULL OR planner_error_reason IN ('did_not_know', 'forgot', 'confused_concepts', 'interpretation', 'inattention', 'other')),
  base_weight REAL,
  adaptive_weight REAL,
  review_sequence INTEGER CHECK (review_sequence IS NULL OR review_sequence BETWEEN 1 AND 99),
  review_rule TEXT CHECK (review_rule IS NULL OR review_rule IN ('day_7', 'month_1', 'month_2', 'month_6')),
  deleted_at TEXT,
  UNIQUE (id, user_id),
  CHECK ((review_sequence IS NULL AND review_rule IS NULL) OR (review_sequence IS NOT NULL AND review_rule IS NOT NULL)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (study_plan_id, user_id) REFERENCES study_plans(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (linked_study_activity_id) REFERENCES activities_new(id) ON DELETE SET NULL
);

INSERT INTO activities_new (
  id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date,
  estimated_minutes, question_count, priority, status, exercise_origin,
  linked_study_activity_id, notes, completed_at, created_at, updated_at,
  planning_origin, focus_label, subtopic_text, sequence_key, sequence_step,
  adaptive_reason, planner_error_reason, base_weight, adaptive_weight,
  review_sequence, review_rule, deleted_at
)
SELECT
  id, user_id, study_plan_id, subject_id, topic_id, activity_type, scheduled_date,
  estimated_minutes, question_count, priority, status, exercise_origin,
  linked_study_activity_id, notes, completed_at, created_at, updated_at,
  planning_origin, focus_label, subtopic_text, sequence_key, sequence_step,
  adaptive_reason, planner_error_reason, base_weight, adaptive_weight,
  NULL, NULL, NULL
FROM activities;

DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX activities_user_date_idx ON activities(user_id, scheduled_date);
CREATE UNIQUE INDEX activities_planner_sequence_idx
  ON activities(user_id, study_plan_id, sequence_key, sequence_step)
  WHERE sequence_key IS NOT NULL AND sequence_step IS NOT NULL;
CREATE INDEX activities_planner_future_idx
  ON activities(user_id, study_plan_id, planning_origin, scheduled_date, status);
CREATE UNIQUE INDEX activities_basic_review_idx
  ON activities(user_id, study_plan_id, linked_study_activity_id, review_sequence)
  WHERE activity_type = 'review' AND review_sequence IS NOT NULL;
CREATE INDEX activities_review_parent_idx
  ON activities(user_id, linked_study_activity_id, status, scheduled_date);
