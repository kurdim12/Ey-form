import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request and guards /admin.
 *
 * Unauthenticated requests to any /admin route (except the login page) are
 * redirected to /admin/login. Keeping getUser() here also ensures the session
 * cookie is refreshed so the realtime client stays authenticated client-side.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/admin/login";

  if (isAdminRoute && !isLoginRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Already signed in but sitting on the login page → send to the dashboard.
  if (isLoginRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
