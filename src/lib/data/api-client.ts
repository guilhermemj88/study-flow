export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`/api/data/${path}`, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (response.status === 401 && typeof window !== "undefined") window.location.replace("/login");
    throw new Error(payload?.error ?? "Não foi possível concluir a operação.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
