import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { after } from "node:test";
import Database from "better-sqlite3";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";

const directory = mkdtempSync(join(tmpdir(), "study-flow-ai-migration-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = directory;

after(() => {
  closeDatabaseForTests();
  assert.ok(!relative(tmpdir(), directory).startsWith(".."));
  rmSync(directory, { recursive: true, force: true });
});

test("migration 008 preserva preferências, calendários e OAuth da versão 007", () => {
  const legacy = new Database(join(directory, "study-flow.sqlite"));
  legacy.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  for (const filename of readdirSync("db/migrations").filter((name) => name.endsWith(".sql") && name < "008").sort()) {
    legacy.exec(readFileSync(join("db/migrations", filename), "utf8"));
    legacy.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(filename, "2026-01-01T00:00:00.000Z");
  }
  const timestamp = "2026-01-01T00:00:00.000Z";
  for (const [id, mode] of [["alice", "mcp"], ["bob", "none"], ["carol", "study_flow"]]) {
    legacy.prepare("INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, 'hash', ?, ?, ?)").run(id, `${id}@example.test`, id, timestamp, timestamp);
    legacy.prepare("INSERT INTO user_ai_preferences (user_id, mode, updated_at) VALUES (?, ?, ?)").run(id, mode, timestamp);
  }
  legacy.prepare("INSERT INTO study_plans (id, user_id, name, study_mode, active, created_at, updated_at) VALUES ('plan', 'alice', 'Preservado', 'basic', 1, ?, ?)").run(timestamp, timestamp);
  legacy.prepare("INSERT INTO oauth_clients (id, client_name, redirect_uris_json, created_at) VALUES ('client', 'Cliente existente', '[]', ?)").run(timestamp);
  legacy.prepare(`INSERT INTO oauth_tokens (id, user_id, client_id, access_token_hash, refresh_token_hash, scopes, resource, expires_at, refresh_expires_at, created_at)
    VALUES ('token', 'alice', 'client', 'access-hash', 'refresh-hash', 'studyflow:read', 'https://mcp.example/mcp', '2099-01-01', '2099-02-01', ?)`).run(timestamp);
  legacy.close();

  const database = getDatabase();
  assert.deepEqual(database.prepare("SELECT user_id, mode, allow_external_ai_processing FROM user_ai_preferences ORDER BY user_id").all(), [
    { user_id: "alice", mode: "mcp", allow_external_ai_processing: 0 },
    { user_id: "bob", mode: "none", allow_external_ai_processing: 0 },
    { user_id: "carol", mode: "study_flow", allow_external_ai_processing: 0 },
  ]);
  assert.deepEqual(database.prepare("SELECT name, study_mode, active FROM study_plans WHERE id = 'plan'").get(), { name: "Preservado", study_mode: "basic", active: 1 });
  assert.deepEqual(database.prepare("SELECT access_token_hash, revoked_at FROM oauth_tokens WHERE id = 'token'").get(), { access_token_hash: "access-hash", revoked_at: null });
  assert.deepEqual(database.pragma("foreign_key_check"), []);
  assert.equal(database.pragma("foreign_keys", { simple: true }), 1);
  assert.equal((database.prepare("SELECT COUNT(*) AS total FROM ai_runs").get() as { total: number }).total, 0);
  assert.throws(() => database.prepare("UPDATE user_ai_preferences SET allow_external_ai_processing = 2 WHERE user_id = 'alice'").run());
  closeDatabaseForTests();
  assert.equal((getDatabase().prepare("SELECT COUNT(*) AS total FROM schema_migrations WHERE name = '008_ai_gateway.sql'").get() as { total: number }).total, 1);
});
