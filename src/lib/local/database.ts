import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

type SqliteDatabase = InstanceType<typeof Database>;

declare global {
  var __studyFlowDatabase: SqliteDatabase | undefined;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return randomUUID();
}

export function getDataDirectory() {
  return process.env.STUDY_FLOW_DATA_DIR
    ? resolve(process.env.STUDY_FLOW_DATA_DIR)
    : join(process.cwd(), "data");
}

export function getUploadsDirectory() {
  const directory = join(getDataDirectory(), "uploads");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function applyMigrations(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const migrationsDirectory = join(process.cwd(), "db", "migrations");
  if (!existsSync(migrationsDirectory)) {
    throw new Error(`Diretório de migrations não encontrado: ${migrationsDirectory}`);
  }
  const applied = database.prepare("SELECT 1 FROM schema_migrations WHERE name = ?");
  const record = database.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.get(filename)) continue;
    const sql = readFileSync(join(migrationsDirectory, filename), "utf8");
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        database.exec(sql);
        const violations = database.pragma("foreign_key_check") as Array<Record<string, unknown>>;
        if (violations.length) throw new Error(`A migration ${filename} deixou referências inválidas no banco.`);
        record.run(filename, nowIso());
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
  }
}

export function getDatabase(): SqliteDatabase {
  if (globalThis.__studyFlowDatabase) return globalThis.__studyFlowDatabase;
  const dataDirectory = getDataDirectory();
  mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(join(dataDirectory, "study-flow.sqlite"));
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  applyMigrations(database);
  globalThis.__studyFlowDatabase = database;
  return database;
}

export function closeDatabaseForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("O banco só pode ser fechado por este helper durante testes.");
  globalThis.__studyFlowDatabase?.close();
  globalThis.__studyFlowDatabase = undefined;
}
