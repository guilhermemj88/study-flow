ALTER TABLE study_plan_settings ADD COLUMN configured_at TEXT;

UPDATE study_plan_settings
SET configured_at = COALESCE(last_generated_at, updated_at)
WHERE last_generated_at IS NOT NULL;

ALTER TABLE sources
  ADD COLUMN is_answer_key INTEGER NOT NULL DEFAULT 0 CHECK (is_answer_key IN (0, 1));

ALTER TABLE mcp_audit_log
  ADD COLUMN target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE mcp_audit_log ADD COLUMN target_user_email TEXT;

CREATE INDEX mcp_audit_target_idx
  ON mcp_audit_log(target_user_id, created_at DESC);

CREATE TABLE questions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  statement TEXT NOT NULL,
  subject_id TEXT,
  topic_id TEXT,
  subtopic_text TEXT,
  explanation TEXT,
  question_status TEXT NOT NULL DEFAULT 'valid' CHECK (question_status IN ('valid', 'annulled')),
  correct_alternative TEXT,
  year INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, source_id, question_number),
  CHECK (
    (question_status = 'valid' AND correct_alternative IS NOT NULL)
    OR (question_status = 'annulled' AND correct_alternative IS NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT
);

INSERT INTO questions_new (
  id, user_id, source_id, question_number, statement, subject_id, topic_id,
  subtopic_text, explanation, question_status, correct_alternative, year, created_at, updated_at
)
SELECT id, user_id, source_id, question_number, statement, subject_id, topic_id,
  subtopic_text, explanation, 'valid', correct_alternative, year, created_at, updated_at
FROM questions;

DROP TABLE questions;
ALTER TABLE questions_new RENAME TO questions;

CREATE INDEX questions_user_source_idx ON questions(user_id, source_id);
CREATE INDEX questions_user_subject_idx ON questions(user_id, subject_id, topic_id);
CREATE INDEX questions_user_status_idx ON questions(user_id, question_status);
