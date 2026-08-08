import { NextResponse } from "next/server";
import { authenticateUser, createUserSession } from "@/lib/local/auth-store";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  const user = authenticateUser(body.email ?? "", body.password ?? "");
  if (!user) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  const session = createUserSession(user.id);
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", expires: new Date(session.expiresAt) });
  return response;
}
