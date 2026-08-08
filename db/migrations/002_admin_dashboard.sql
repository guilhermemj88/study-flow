ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));

ALTER TABLE oauth_clients ADD COLUMN last_authorized_at TEXT;
ALTER TABLE oauth_clients ADD COLUMN last_used_at TEXT;
ALTER TABLE oauth_clients ADD COLUMN revoked_at TEXT;

ALTER TABLE mcp_audit_log
  ADD COLUMN client_id TEXT REFERENCES oauth_clients(id) ON DELETE SET NULL;

CREATE INDEX users_role_idx ON users(role);
CREATE INDEX oauth_clients_last_used_idx ON oauth_clients(last_used_at DESC);
CREATE INDEX mcp_audit_created_idx ON mcp_audit_log(created_at DESC);
CREATE INDEX mcp_audit_client_idx ON mcp_audit_log(client_id, created_at DESC);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX admin_audit_created_idx ON admin_audit_log(created_at DESC);
CREATE INDEX admin_audit_user_idx ON admin_audit_log(admin_user_id, created_at DESC);
