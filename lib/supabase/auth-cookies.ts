const LEGACY_AUTH_COOKIE_NAMES = new Set([
  "sb-access-token",
  "sb-refresh-token",
  "supabase-auth-token",
]);

export function isSupabaseAuthCookieName(name: string) {
  return (
    LEGACY_AUTH_COOKIE_NAMES.has(name) ||
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name)
  );
}

export function hasSupabaseAuthCookie(cookieList: { name: string }[]) {
  return cookieList.some((cookie) => isSupabaseAuthCookieName(cookie.name));
}
