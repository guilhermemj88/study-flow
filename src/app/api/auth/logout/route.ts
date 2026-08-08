import { NextResponse } from "next/server";
import { revokeUserSession } from "@/lib/local/auth-store";
import { SESSION_COOKIE } from "@/lib/auth/constants";

function sessionToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export async function POST(request: Request) {
  revokeUserSession(sessionToken(request));
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
