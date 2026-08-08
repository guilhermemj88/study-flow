CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions(expires_at);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, subject_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE CASCADE
);

CREATE TABLE study_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_exam_name TEXT,
  exam_date TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX one_active_plan_per_user ON study_plans(user_id) WHERE active = 1;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('exam', 'edital', 'other')),
  institution TEXT,
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1900 AND 2200),
  edition TEXT,
  description TEXT,
  storage_path TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
  source_url TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'manual' CHECK (analysis_status IN ('pending', 'analyzed', 'error', 'manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE source_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'analyzed', 'error', 'manual')),
  summary TEXT NOT NULL,
  raw_content TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE
);

CREATE TABLE study_plan_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  study_plan_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  use_for_incidence INTEGER NOT NULL DEFAULT 1 CHECK (use_for_incidence IN (0, 1)),
  use_for_questions INTEGER NOT NULL DEFAULT 1 CHECK (use_for_questions IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, study_plan_id, source_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (study_plan_id, user_id) REFERENCES study_plans(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE
);

CREATE TABLE activities (
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
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'attention', 'completed')),
  exercise_origin TEXT NOT NULL DEFAULT 'manual' CHECK (exercise_origin IN ('manual', 'question_bank')),
  linked_study_activity_id TEXT,
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (study_plan_id, user_id) REFERENCES study_plans(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (linked_study_activity_id, user_id) REFERENCES activities(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE activity_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  actual_minutes INTEGER,
  questions_answered INTEGER,
  correct_answers INTEGER,
  wrong_answers INTEGER,
  accuracy REAL,
  perceived_difficulty TEXT NOT NULL CHECK (perceived_difficulty IN ('easy', 'normal', 'hard')),
  error_reasons_json TEXT NOT NULL DEFAULT '[]',
  study_methods_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, activity_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, user_id) REFERENCES activities(id, user_id) ON DELETE CASCADE
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  statement TEXT NOT NULL,
  subject_id TEXT,
  topic_id TEXT,
  subtopic_text TEXT,
  explanation TEXT,
  correct_alternative TEXT NOT NULL,
  year INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, source_id, question_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE question_alternatives (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, question_id, label),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, user_id) REFERENCES questions(id, user_id) ON DELETE CASCADE
);

CREATE TABLE question_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  activity_id TEXT,
  selected_alternative TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  error_reason TEXT,
  answered_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, user_id) REFERENCES questions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, user_id) REFERENCES activities(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE activity_error_details (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  topic_id TEXT,
  topic_text TEXT,
  subtopic_text TEXT,
  error_count INTEGER NOT NULL CHECK (error_count > 0),
  error_reason TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, user_id) REFERENCES activities(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE source_topic_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  topic_id TEXT,
  subtopic_text TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  incidence_percentage REAL NOT NULL DEFAULT 0,
  analysis_origin TEXT NOT NULL DEFAULT 'manual' CHECK (analysis_origin IN ('manual', 'mcp', 'imported')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, user_id) REFERENCES sources(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id, user_id) REFERENCES topics(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE exercise_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_id TEXT,
  question_count INTEGER NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, user_id) REFERENCES activities(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE exercise_session_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  selected_alternative TEXT,
  correct INTEGER,
  error_reason TEXT,
  attempt_id TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  UNIQUE (user_id, session_id, position),
  UNIQUE (user_id, session_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, user_id) REFERENCES exercise_sessions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, user_id) REFERENCES questions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id, user_id) REFERENCES question_attempts(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

CREATE TABLE oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

CREATE TABLE oauth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

CREATE INDEX subjects_user_idx ON subjects(user_id);
CREATE INDEX topics_user_subject_idx ON topics(user_id, subject_id);
CREATE INDEX sources_user_created_idx ON sources(user_id, created_at DESC);
CREATE INDEX plan_sources_user_plan_idx ON study_plan_sources(user_id, study_plan_id);
CREATE INDEX activities_user_date_idx ON activities(user_id, scheduled_date);
CREATE INDEX questions_user_source_idx ON questions(user_id, source_id);
CREATE INDEX questions_user_subject_idx ON questions(user_id, subject_id, topic_id);
CREATE INDEX attempts_user_question_idx ON question_attempts(user_id, question_id, answered_at DESC);
CREATE INDEX stats_user_source_idx ON source_topic_stats(user_id, source_id);
CREATE INDEX oauth_tokens_access_idx ON oauth_tokens(access_token_hash, revoked_at);

CREATE TABLE mcp_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  resource_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX mcp_audit_user_idx ON mcp_audit_log(user_id, created_at DESC);
