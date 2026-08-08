import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/server-session";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  return user ? NextResponse.json({ user }) : NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}
