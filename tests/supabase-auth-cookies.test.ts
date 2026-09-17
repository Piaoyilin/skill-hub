import { describe, expect, it } from "vitest";

import {
  hasSupabaseAuthCookie,
  isSupabaseAuthCookieName,
} from "../lib/supabase/auth-cookies";

describe("Supabase auth cookie detection", () => {
  it("detects current and chunked Supabase auth cookies", () => {
    expect(isSupabaseAuthCookieName("sb-abcdefghijklmnopqrst-auth-token")).toBe(
      true,
    );
    expect(isSupabaseAuthCookieName("sb-abcdefghijklmnopqrst-auth-token.0")).toBe(
      true,
    );
  });

  it("detects legacy Supabase auth cookie names", () => {
    expect(isSupabaseAuthCookieName("sb-access-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-refresh-token")).toBe(true);
    expect(isSupabaseAuthCookieName("supabase-auth-token")).toBe(true);
  });

  it("does not treat unrelated cookies as auth cookies", () => {
    expect(hasSupabaseAuthCookie([{ name: "theme" }, { name: "session" }])).toBe(
      false,
    );
  });
});
