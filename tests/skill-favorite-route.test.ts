import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockFavoriteError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    getCurrentUser: vi.fn(),
    favoriteSkill: vi.fn(),
    unfavoriteSkill: vi.fn(),
    getFavoriteStatusForSlug: vi.fn(),
    FavoriteError: MockFavoriteError,
  };
});

vi.mock("../lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("../lib/registry/favorites", () => ({
  FavoriteError: mocks.FavoriteError,
  favoriteSkill: mocks.favoriteSkill,
  unfavoriteSkill: mocks.unfavoriteSkill,
  getFavoriteStatusForSlug: mocks.getFavoriteStatusForSlug,
}));

import {
  DELETE,
  GET,
  POST,
} from "../app/api/skills/[slug]/favorite/route";

const user = {
  authUser: { id: "auth-user-1" },
  profile: {
    id: "profile-user-a",
    authUserId: "auth-user-1",
    username: "user-a",
    displayName: "用户 A",
    avatarUrl: null,
  },
};

function routeContext(slug = "demo-skill") {
  return { params: Promise.resolve({ slug }) };
}

describe("Skill favorite API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.favoriteSkill.mockResolvedValue({ favorited: true });
    mocks.unfavoriteSkill.mockResolvedValue({ favorited: false });
    mocks.getFavoriteStatusForSlug.mockResolvedValue(true);
  });

  it("returns 401 AUTH_REQUIRED without calling the favorite service", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/skills/demo-skill/favorite", {
        method: "POST",
      }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      success: false,
      error: { code: "AUTH_REQUIRED" },
    });
    expect(mocks.favoriteSkill).not.toHaveBeenCalled();
  });

  it("uses the server profile id and ignores a spoofed userId body", async () => {
    const response = await POST(
      new Request("http://localhost/api/skills/demo-skill/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "profile-user-attacker" }),
      }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, favorited: true });
    expect(mocks.favoriteSkill).toHaveBeenCalledWith(
      "profile-user-a",
      "demo-skill",
    );
  });

  it("returns the persisted false state from DELETE", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/skills/demo-skill/favorite", {
        method: "DELETE",
      }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, favorited: false });
    expect(mocks.unfavoriteSkill).toHaveBeenCalledWith(
      "profile-user-a",
      "demo-skill",
    );
  });

  it("returns the server-side status from GET", async () => {
    const response = await GET(
      new Request("http://localhost/api/skills/demo-skill/favorite"),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, favorited: true });
    expect(mocks.getFavoriteStatusForSlug).toHaveBeenCalledWith(
      "profile-user-a",
      "demo-skill",
    );
  });

  it("maps a missing public Skill to 404", async () => {
    mocks.favoriteSkill.mockRejectedValue(
      new mocks.FavoriteError("SKILL_NOT_FOUND", "未找到这个公开 Skill。"),
    );

    const response = await POST(
      new Request("http://localhost/api/skills/missing/favorite", {
        method: "POST",
      }),
      routeContext("missing"),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({
      success: false,
      error: { code: "SKILL_NOT_FOUND" },
    });
  });
});
