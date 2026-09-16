import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getRegistrySkillBySlug: vi.fn(),
  getFavoriteStatus: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/registry", () => ({
  getRegistrySkillBySlug: mocks.getRegistrySkillBySlug,
}));

vi.mock("@/lib/registry/favorites", () => ({
  getFavoriteStatus: mocks.getFavoriteStatus,
}));

import SkillPage from "../app/skills/[slug]/page";

function createSkill() {
  return {
    slug: "demo-skill",
    name: "Demo Skill",
    description: "Demo",
    category: "前端",
    tags: [],
    author: "Owner",
    authorHandle: "owner",
    version: "1.0.0",
    downloads: 0,
    stars: 0,
    updatedAt: "2026-09-16",
    createdAt: "2026-09-16",
    icon: "S",
    accent: "indigo",
    verified: false,
    featured: false,
    packageAvailable: true,
    owner: null,
    files: [],
    readme: [],
    changelog: [],
    versions: [],
    databaseId: "skill-1",
    ownerProfileId: "profile-owner",
  };
}

function currentUser() {
  return {
    authUser: { id: "auth-user-1" },
    profile: {
      id: "profile-owner",
      authUserId: "auth-user-1",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
    },
  };
}

describe("Skill detail page data flow", () => {
  it("starts the public Skill query while auth is pending and keeps owner checks server-side", async () => {
    vi.clearAllMocks();
    let resolveAuth: (value: ReturnType<typeof currentUser>) => void = () => {};
    mocks.getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );
    mocks.getRegistrySkillBySlug.mockResolvedValue(createSkill());
    mocks.getFavoriteStatus.mockResolvedValue(true);

    const pagePromise = SkillPage({
      params: Promise.resolve({ slug: "demo-skill" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.getRegistrySkillBySlug).toHaveBeenCalledWith("demo-skill", {
      includeServerIds: true,
    });

    resolveAuth(currentUser());
    const element = (await pagePromise) as any;

    expect(mocks.getFavoriteStatus).toHaveBeenCalledWith(
      "profile-owner",
      "skill-1",
    );
    expect(element.props.initialFavorited).toBe(true);
    expect(element.props.skill.canManage).toBe(true);
    expect(element.props.skill).not.toHaveProperty("databaseId");
    expect(element.props.skill).not.toHaveProperty("ownerProfileId");
  });
});
