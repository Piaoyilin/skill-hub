import { describe, expect, it, vi } from "vitest";

import { getNavbarInitialAuthUser } from "../components/navbar";

describe("Navbar auth initialization", () => {
  it("uses the browser session state without forcing an extra getUser request", async () => {
    const user = { id: "auth-user-1" } as never;
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user } },
        })),
        getUser: vi.fn(),
      },
    };

    await expect(getNavbarInitialAuthUser(supabase, "/dashboard")).resolves.toBe(
      user,
    );
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("returns null when the browser has no session", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
        })),
      },
    };

    await expect(getNavbarInitialAuthUser(supabase, "/")).resolves.toBeNull();
  });
});
