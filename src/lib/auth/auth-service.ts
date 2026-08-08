import type { LocalAuthUser } from "@/types/auth";

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a autenticação.");
  return data;
}

export async function signIn(email: string, password: string) {
  await authRequest<{ user: LocalAuthUser }>("/api/auth/login", { email, password });
}

export async function signUp(input: { displayName: string; email: string; password: string }) {
  await authRequest<{ user: LocalAuthUser }>("/api/auth/signup", input);
  return { needsEmailConfirmation: false };
}

export async function signOut() {
  await authRequest<{ success: boolean }>("/api/auth/logout", {});
}

export async function getCurrentUser(): Promise<LocalAuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Não foi possível carregar a conta local.");
  const data = await response.json() as { user: LocalAuthUser };
  return data.user;
}
