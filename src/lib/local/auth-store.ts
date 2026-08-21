import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDatabase, newId, nowIso } from "@/lib/local/database";
import type { LocalAuthUser } from "@/types/auth";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: "admin" | "user";
}

const SESSION_DAYS = 30;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function passwordHash(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function passwordMatches(password: string, stored: string) {
  const [algorithm, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function toUser(row: UserRow): LocalAuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export function createUser(input: { displayName: string; email: string; password: string }): LocalAuthUser {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (displayName.length < 2) throw new Error("Informe um nome com pelo menos 2 caracteres.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if (input.password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const database = getDatabase();
  const exists = database.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) throw new Error("Este e-mail já possui uma conta.");
  const id = newId();
  const timestamp = nowIso();
  database.transaction(() => {
    database.prepare(`INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, email, passwordHash(input.password), displayName, timestamp, timestamp);
    database.prepare(`INSERT INTO study_plans (id, user_id, name, active, study_mode, created_at, updated_at)
      VALUES (?, ?, 'Meu plano', 1, 'advanced', ?, ?)`)
      .run(newId(), id, timestamp, timestamp);
  })();
  return { id, email, displayName, role: "user" };
}

export function authenticateUser(emailInput: string, password: string): LocalAuthUser | null {
  const row = getDatabase().prepare("SELECT id, email, password_hash, display_name, role FROM users WHERE email = ?")
    .get(emailInput.trim().toLowerCase()) as UserRow | undefined;
  if (!row || !passwordMatches(password, row.password_hash)) return null;
  return toUser(row);
}

export function createUserSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  getDatabase().prepare(`INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), userId, tokenHash(token), expiresAt, createdAt, createdAt);
  return { token, expiresAt };
}

export function getUserBySessionToken(token?: string | null): LocalAuthUser | null {
  if (!token) return null;
  const database = getDatabase();
  database.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(nowIso());
  const row = database.prepare(`SELECT users.id, users.email, users.password_hash, users.display_name, users.role
    FROM user_sessions JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?`)
    .get(tokenHash(token), nowIso()) as UserRow | undefined;
  if (!row) return null;
  database.prepare("UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?")
    .run(nowIso(), tokenHash(token));
  return toUser(row);
}

export function revokeUserSession(token?: string | null) {
  if (!token) return;
  getDatabase().prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash(token));
}
