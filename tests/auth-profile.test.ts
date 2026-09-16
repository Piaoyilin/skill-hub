import { describe, expect, it, vi } from "vitest";
import { ensureProfile } from "../lib/auth/server";

function authUser(metadata: Record<string, unknown> = {}) {
  return {
    id: "auth-user-1",
    user_metadata: metadata,
  } as never;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    authUserId: "auth-user-1",
    username: "alice-authuser",
    displayName: "Alice",
    avatarUrl: "https://example.com/avatar.png",
    ...overrides,
  };
}

const profileSelect = {
  id: true,
  authUserId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
};

describe("ensureProfile", () => {
  it("reuses an existing profile without repeating an upsert or update", async () => {
    const existing = profile();
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
    };

    await expect(
      ensureProfile(
        authUser({
          display_name: "Alice",
          username: "alice",
          avatar_url: "https://example.com/avatar.png",
        }),
        { db: db as never },
      ),
    ).resolves.toEqual(existing);

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { authUserId: "auth-user-1" },
      select: profileSelect,
    });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.upsert).not.toHaveBeenCalled();
  });

  it("creates a profile on first authenticated access", async () => {
    const created = profile();
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        update: vi.fn(),
      },
    };

    await expect(
      ensureProfile(
        authUser({
          display_name: "Alice",
          username: "alice",
          avatar_url: "https://example.com/avatar.png",
        }),
        { db: db as never },
      ),
    ).resolves.toEqual(created);

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        authUserId: "auth-user-1",
        username: "alice-authuser",
        displayName: "Alice",
        avatarUrl: "https://example.com/avatar.png",
      },
      select: profileSelect,
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("updates only when auth metadata changed", async () => {
    const updated = profile({ displayName: "Alice Updated", avatarUrl: null });
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(profile()),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(updated),
      },
    };

    await expect(
      ensureProfile(
        authUser({
          display_name: "Alice Updated",
        }),
        { db: db as never },
      ),
    ).resolves.toEqual(updated);

    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { authUserId: "auth-user-1" },
      data: {
        displayName: "Alice Updated",
        avatarUrl: null,
      },
      select: profileSelect,
    });
  });

  it("recovers if a concurrent request created the profile first", async () => {
    const createdElsewhere = profile();
    const db = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(createdElsewhere),
        create: vi.fn().mockRejectedValue(new Error("unique constraint")),
        update: vi.fn(),
      },
    };

    await expect(
      ensureProfile(
        authUser({
          display_name: "Alice",
          username: "alice",
          avatar_url: "https://example.com/avatar.png",
        }),
        { db: db as never },
      ),
    ).resolves.toEqual(createdElsewhere);
  });
});
