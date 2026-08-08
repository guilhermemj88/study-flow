import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_ROUTES = ["/login", "/cadastro"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
