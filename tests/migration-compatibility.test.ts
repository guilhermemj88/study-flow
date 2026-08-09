import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import Database from "better-sqlite3";
import { closeDatabaseForTests, getDatabase } from "../src/lib/local/database";

const dataDirectory = mkdtempSync(join(tmpdir(), "study-flow-migration-test-"));
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.STUDY_FLOW_DATA_DIR = dataDirectory;

after(() => {
  closeDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

test("migration 004 preserva questão, alternativa e vínculos criados no schema anterior", () => {
  const legacy = new Database(join(dataDirectory, "study-flow.sqlite"));
  legacy.pragma("foreign_keys = ON");
  legacy.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  for (const filename of ["001_initial.sql", "002_admin_dashboard.sql", "003_adaptive_study_planner.sql"]) {
    legacy.exec(readFileSync(join(process.cwd(), "db", "migrations", filename), "utf8"));
    legacy.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(filename, "2026-01-01T00:00:00.000Z");
  }
  const timestamp = "2026-01-01T00:00:00.000Z";
  legacy.prepare("INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES ('user-1', 'legacy@test.local', 'hash', 'Legacy', ?, ?)").run(timestamp, timestamp);
  legacy.prepare("INSERT INTO study_plans (id, user_id, name, active, created_at, updated_at) VALUES ('plan-1', 'user-1', 'Plano', 1, ?, ?)").run(timestamp, timestamp);
  legacy.prepare("INSERT INTO sources (id, user_id, name, source_type, analysis_status, created_at, updated_at) VALUES ('source-1', 'user-1', 'Prova antiga', 'exam', 'manual', ?, ?)").run(timestamp, timestamp);
  legacy.prepare(`INSERT INTO questions (id, user_id, source_id, question_number, statement, correct_alternative, created_at, updated_at)
    VALUES ('question-1', 'user-1', 'source-1', 1, 'Enunciado preservado', 'A', ?, ?)`).run(timestamp, timestamp);
  legacy.prepare(`INSERT INTO question_alternatives (id, user_id, question_id, label, text, sort_order, created_at)
    VALUES ('alternative-1', 'user-1', 'question-1', 'A', 'Resposta preservada', 0, ?)`).run(timestamp);
  legacy.close();

  const migrated = getDatabase();
  const question = migrated.prepare("SELECT statement, question_status, correct_alternative FROM questions WHERE id = 'question-1'").get() as {
    statement: string; question_status: string; correct_alternative: string | null;
  };
  assert.deepEqual(question, { statement: "Enunciado preservado", question_status: "valid", correct_alternative: "A" });
  assert.equal((migrated.prepare("SELECT text FROM question_alternatives WHERE id = 'alternative-1'").get() as { text: string }).text, "Resposta preservada");
  assert.equal((migrated.prepare("SELECT COUNT(*) total FROM pragma_foreign_key_check").get() as { total: number }).total, 0);
});
