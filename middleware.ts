import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logTimingEvent, measureAsync } from "@/lib/diagnostics/timing";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";

export async function middleware(request: NextRequest) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    logTimingEvent("MIDDLEWARE AUTH skipped", {
      route: request.nextUrl.pathname,
      reason: "no auth cookie",
    });
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await measureAsync(
    "MIDDLEWARE AUTH",
    "getUser",
    () => supabase.auth.getUser(),
    { route: request.nextUrl.pathname },
  );
  return response;

}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],

};
