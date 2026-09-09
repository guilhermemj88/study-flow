CREATE TABLE user_ai_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('study_flow', 'mcp', 'none')),
  updated_at TEXT NOT NULL
);

CREATE INDEX oauth_tokens_user_client_idx ON oauth_tokens(user_id, client_id);
