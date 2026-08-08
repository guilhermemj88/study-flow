import { NextResponse } from "next/server";
import { createUser, createUserSession } from "@/lib/local/auth-store";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { displayName?: string; email?: string; password?: string };
    const user = createUser({ displayName: body.displayName ?? "", email: body.email ?? "", password: body.password ?? "" });
    const session = createUserSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 400 });
  }
}
