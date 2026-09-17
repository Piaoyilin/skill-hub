import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  SupabaseConfigurationError,
} from "./config";
import { hasSupabaseAuthCookie } from "./auth-cookies";

export async function requestHasSupabaseAuthCookie() {
  const cookieStore = await cookies();
  return hasSupabaseAuthCookie(cookieStore.getAll());
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new SupabaseConfigurationError();
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always write cookies; middleware refreshes them.
        }
      },
    },
  });

}
