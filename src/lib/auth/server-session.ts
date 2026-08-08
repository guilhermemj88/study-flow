import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken } from "@/lib/local/auth-store";
import { SESSION_COOKIE } from "@/lib/auth/constants";

function cookieValue(header: string | null, name: string) {
  if (!header) return undefined;
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function getCurrentPageUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getUserBySessionToken(token);
}

export async function requirePageUser() {
  const user = await getCurrentPageUser();
  if (!user) redirect("/login");
  return user;
}

export function getRequestUser(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  return getUserBySessionToken(token);
}

export function requireRequestUser(request: Request) {
  const user = getRequestUser(request);
  if (!user) throw new Response(JSON.stringify({ error: "Sua sessão expirou. Entre novamente." }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}
