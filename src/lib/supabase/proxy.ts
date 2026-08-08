import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

const AUTH_ROUTES = ["/login", "/cadastro"];
const PUBLIC_ROUTES = [...AUTH_ROUTES, "/auth/callback"];

function routeMatches(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  const isPublicRoute = routeMatches(request.nextUrl.pathname, PUBLIC_ROUTES);

  if (!config) {
    if (isPublicRoute) return NextResponse.next({ request });
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("reason", "setup");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && routeMatches(request.nextUrl.pathname, AUTH_ROUTES)) {
    const todayUrl = request.nextUrl.clone();
    todayUrl.pathname = "/hoje";
    todayUrl.search = "";
    return NextResponse.redirect(todayUrl);
  }

  return response;
}
