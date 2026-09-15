import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockSkillManagementError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    getCurrentUser: vi.fn(),
    updateOwnedSkill: vi.fn(),
    archiveOwnedSkill: vi.fn(),
    restoreOwnedSkill: vi.fn(),
    SkillManagementError: MockSkillManagementError,
  };
});

vi.mock("../lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("../lib/registry/management", () => ({
  SkillManagementError: mocks.SkillManagementError,
  updateOwnedSkill: mocks.updateOwnedSkill,
  archiveOwnedSkill: mocks.archiveOwnedSkill,
  restoreOwnedSkill: mocks.restoreOwnedSkill,
}));

import { PATCH } from "../app/api/skills/[slug]/route";
import { POST as archive } from "../app/api/skills/[slug]/archive/route";
import { POST as restore } from "../app/api/skills/[slug]/restore/route";

const user = {
  authUser: { id: "auth-user-1" },
  profile: {
    id: "profile-owner",
    authUserId: "auth-user-1",
    username: "owner",
    displayName: "技能作者",
    avatarUrl: null,
  },
};

function routeContext(slug = "demo-skill") {
  return { params: Promise.resolve({ slug }) };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/skills/demo-skill", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Skill owner management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.updateOwnedSkill.mockResolvedValue({
      id: "skill-1",
      slug: "demo-skill",
      updatedAt: "2026-09-15",
    });
    mocks.archiveOwnedSkill.mockResolvedValue({
      id: "skill-1",
      slug: "demo-skill",
      status: "ARCHIVED",
    });
    mocks.restoreOwnedSkill.mockResolvedValue({
      id: "skill-1",
      slug: "demo-skill",
      status: "PUBLISHED",
    });
  });

  it("returns 401 and does not update when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      jsonRequest({ displayName: "不应保存" }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("AUTH_REQUIRED");
    expect(mocks.updateOwnedSkill).not.toHaveBeenCalled();
  });

  it("passes only allowed public fields and the server profile id", async () => {
    const response = await PATCH(
      jsonRequest({
        displayName: "新名称",
        description: "新描述",
        category: "前端",
        tags: ["React"],
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateOwnedSkill).toHaveBeenCalledWith(
      "demo-skill",
      "profile-owner",
      {
        displayName: "新名称",
        description: "新描述",
        category: "前端",
        tags: ["React"],
      },
    );
  });

  it("rejects protected fields instead of forwarding them", async () => {
    const response = await PATCH(
      jsonRequest({ ownerId: "attacker", downloads: 999 }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("SKILL_UPDATE_INVALID");
    expect(mocks.updateOwnedSkill).not.toHaveBeenCalled();
  });

  it("maps a non-Owner update to 403", async () => {
    mocks.updateOwnedSkill.mockRejectedValue(
      new mocks.SkillManagementError(
        "SKILL_PERMISSION_DENIED",
        "无权管理该 Skill。",
      ),
    );

    const response = await PATCH(
      jsonRequest({ displayName: "不应保存" }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("SKILL_PERMISSION_DENIED");
  });

  it("requires authentication for archive and restore actions", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const archiveResponse = await archive(
      new Request("http://localhost/api/skills/demo-skill/archive", {
        method: "POST",
      }),
      routeContext(),
    );
    const restoreResponse = await restore(
      new Request("http://localhost/api/skills/demo-skill/restore", {
        method: "POST",
      }),
      routeContext(),
    );

    expect(archiveResponse.status).toBe(401);
    expect(restoreResponse.status).toBe(401);
    expect(mocks.archiveOwnedSkill).not.toHaveBeenCalled();
    expect(mocks.restoreOwnedSkill).not.toHaveBeenCalled();
  });

  it("uses the server profile for archive and restore", async () => {
    const archiveResponse = await archive(
      new Request("http://localhost/api/skills/demo-skill/archive", {
        method: "POST",
      }),
      routeContext(),
    );
    const restoreResponse = await restore(
      new Request("http://localhost/api/skills/demo-skill/restore", {
        method: "POST",
      }),
      routeContext(),
    );

    expect(archiveResponse.status).toBe(200);
    expect(restoreResponse.status).toBe(200);
    expect(mocks.archiveOwnedSkill).toHaveBeenCalledWith(
      "demo-skill",
      "profile-owner",
    );
    expect(mocks.restoreOwnedSkill).toHaveBeenCalledWith(
      "demo-skill",
      "profile-owner",
    );
  });

  it("maps an invalid status transition to 409", async () => {
    mocks.archiveOwnedSkill.mockRejectedValue(
      new mocks.SkillManagementError(
        "SKILL_STATUS_INVALID",
        "只有已发布的 Skill 才能下架。",
      ),
    );

    const response = await archive(
      new Request("http://localhost/api/skills/demo-skill/archive", {
        method: "POST",
      }),
      routeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("SKILL_STATUS_INVALID");
  });
});
