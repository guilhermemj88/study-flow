ALTER TABLE user_ai_preferences ADD COLUMN allow_external_ai_processing INTEGER NOT NULL DEFAULT 0
  CHECK (allow_external_ai_processing IN (0, 1));

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  task_version INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'blocked')),
  input_tokens INTEGER CHECK (input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  external_processing_used INTEGER NOT NULL DEFAULT 0 CHECK (external_processing_used IN (0, 1)),
  error_code TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  deadline_at TEXT NOT NULL,
  UNIQUE (id, user_id)
);
CREATE INDEX ai_runs_user_created_idx ON ai_runs(user_id, created_at DESC);
CREATE UNIQUE INDEX ai_runs_user_running_idx ON ai_runs(user_id) WHERE status = 'running';

CREATE TABLE ai_source_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  key_points_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, user_id) REFERENCES ai_runs(id, user_id) ON DELETE CASCADE
);
CREATE INDEX ai_source_summaries_user_source_idx ON ai_source_summaries(user_id, source_id);
