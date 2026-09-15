import { describe, expect, it } from "vitest";
import { ensureProfile } from "../lib/auth/server";

describe("ensureProfile", () => {
  it("creates or updates a business profile from Supabase Auth metadata", async () => {
    const calls: unknown[] = [];
    const db = {
      user: {
        upsert: async (args: unknown) => {
          calls.push(args);
          return {
            id: "profile-1",
            authUserId: "auth-user-1",
            username: "alice-auth-use",
            displayName: "Alice",
            avatarUrl: "https://example.com/avatar.png",
          };
        },
      },
    };

    const profile = await ensureProfile(
      {
        id: "auth-user-1",
        user_metadata: {
          display_name: "Alice",
          username: "alice",
          avatar_url: "https://example.com/avatar.png",
        },
      } as never,
      { db: db as never },
    );

    expect(profile).toMatchObject({
      authUserId: "auth-user-1",
      displayName: "Alice",
    });
    expect(calls[0]).toEqual({
      where: { authUserId: "auth-user-1" },
      update: {
        displayName: "Alice",
        avatarUrl: "https://example.com/avatar.png",
      },
      create: {
        authUserId: "auth-user-1",
        username: "alice-authuser",
        displayName: "Alice",
        avatarUrl: "https://example.com/avatar.png",
      },
      select: {
        id: true,
        authUserId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });
  });
});
