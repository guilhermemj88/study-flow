import { getDatabase } from "@/lib/local/database";
import type { LocalAuthUser } from "@/types/auth";

export interface TargetUserInput {
  targetUserEmail?: string;
  targetUserId?: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
}

function toUser(row: UserRow): LocalAuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export function resolveTargetUser(input: {
  authenticatedUser: Pick<LocalAuthUser, "id">;
  targetUserEmail?: string;
  targetUserId?: string;
}): LocalAuthUser {
  const database = getDatabase();
  const authenticated = database.prepare("SELECT id, email, display_name, role FROM users WHERE id = ?")
    .get(input.authenticatedUser.id) as UserRow | undefined;
  if (!authenticated) throw new Error("Usuário OAuth autenticado não foi encontrado.");

  const targetEmail = input.targetUserEmail?.trim().toLowerCase() || undefined;
  const targetId = input.targetUserId?.trim() || undefined;
  if (!targetEmail && !targetId) return toUser(authenticated);
  if ((!targetEmail || targetEmail === authenticated.email.toLowerCase()) && (!targetId || targetId === authenticated.id)) {
    return toUser(authenticated);
  }
  if (authenticated.role !== "admin") throw new Error("Acesso negado: somente administradores podem informar outro usuário alvo.");

  const byId = targetId
    ? database.prepare("SELECT id, email, display_name, role FROM users WHERE id = ?").get(targetId) as UserRow | undefined
    : undefined;
  const byEmail = targetEmail
    ? database.prepare("SELECT id, email, display_name, role FROM users WHERE email = ?").get(targetEmail) as UserRow | undefined
    : undefined;
  if ((targetId && !byId) || (targetEmail && !byEmail)) throw new Error("Usuário alvo não encontrado.");
  if (byId && byEmail && byId.id !== byEmail.id) throw new Error("targetUserId e targetUserEmail identificam usuários diferentes.");
  return toUser(byId ?? byEmail!);
}
