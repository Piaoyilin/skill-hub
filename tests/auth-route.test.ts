import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  publishSkillPackage: vi.fn(),
}));

vi.mock("../lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("../lib/registry/publish", () => ({
  publishSkillPackage: mocks.publishSkillPackage,
}));

import { POST } from "../app/api/skills/publish/route";

function requestWithZip() {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob(["test zip"], { type: "application/zip" }),
    "skill.zip",
  );

  return new Request("http://localhost/api/skills/publish", {
    method: "POST",
    body: formData,
  });
}

function requestWithDetails() {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob(["test zip"], { type: "application/zip" }),
    "skill.zip",
  );
  formData.append("category", "前端");
  formData.append("version", "2.0.0");
  formData.append("slug", "locked-skill");
  formData.append("targetSlug", "locked-skill");
  formData.append("displayName", "Locked Skill");
  formData.append("description", "发布时的描述");
  formData.append("tags", "React,性能");

  return new Request("http://localhost/api/skills/publish", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/skills/publish authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no authenticated user is present", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(requestWithZip());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      success: false,
      error: { code: "AUTH_REQUIRED" },
    });
    expect(mocks.publishSkillPackage).not.toHaveBeenCalled();
  });

  it("passes the server-owned profile to the publication service", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      authUser: { id: "auth-user-1" },
      profile: {
        id: "profile-1",
        authUserId: "auth-user-1",
        username: "owner-1",
        displayName: "技能作者",
        avatarUrl: null,
      },
    });
    mocks.publishSkillPackage.mockResolvedValue({
      kind: "success",
      skill: {
        id: "skill-1",
        slug: "demo-skill",
        version: "1.0.0",
        url: "/skills/demo-skill",
      },
      validation: { valid: true, issues: [] },
      warnings: [],
    });

    const response = await POST(requestWithZip());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.publishSkillPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "skill.zip",
        buffer: expect.any(Uint8Array),
      }),
      { category: undefined, version: undefined, tags: [] },
      {
        owner: {
          id: "profile-1",
          username: "owner-1",
          displayName: "技能作者",
        },
      },
    );
  });

  it("passes publish details while keeping the Owner server-owned", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      authUser: { id: "auth-user-1" },
      profile: {
        id: "profile-1",
        authUserId: "auth-user-1",
        username: "owner-1",
        displayName: "技能作者",
        avatarUrl: null,
      },
    });
    mocks.publishSkillPackage.mockResolvedValue({
      kind: "success",
      skill: {
        id: "skill-1",
        slug: "locked-skill",
        version: "2.0.0",
        url: "/skills/locked-skill",
      },
      validation: { valid: true, issues: [] },
      warnings: [],
    });

    const response = await POST(requestWithDetails());

    expect(response.status).toBe(200);
    expect(mocks.publishSkillPackage).toHaveBeenCalledWith(
      expect.anything(),
      {
        category: "前端",
        version: "2.0.0",
        tags: ["React,性能"],
        slug: "locked-skill",
        targetSlug: "locked-skill",
        displayName: "Locked Skill",
        description: "发布时的描述",
      },
      {
        owner: {
          id: "profile-1",
          username: "owner-1",
          displayName: "技能作者",
        },
      },
    );
  });

  it("keeps publish conflict status stable for the UI error mapper", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      authUser: { id: "auth-user-1" },
      profile: {
        id: "profile-1",
        authUserId: "auth-user-1",
        username: "owner-1",
        displayName: "技能作者",
        avatarUrl: null,
      },
    });
    mocks.publishSkillPackage.mockResolvedValue({
      kind: "error",
      error: {
        code: "SKILL_VERSION_EXISTS",
        message: "该 Skill 版本已经存在。",
      },
    });

    const response = await POST(requestWithZip());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      error: { code: "SKILL_VERSION_EXISTS" },
    });
  });

  it("keeps Owner permission failures separate from authentication failures", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      authUser: { id: "auth-user-1" },
      profile: {
        id: "profile-1",
        authUserId: "auth-user-1",
        username: "owner-1",
        displayName: "技能作者",
        avatarUrl: null,
      },
    });
    mocks.publishSkillPackage.mockResolvedValue({
      kind: "error",
      error: {
        code: "SKILL_PERMISSION_DENIED",
        message: "你不是该 Skill 的 Owner。",
      },
    });

    const response = await POST(requestWithZip());

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SKILL_PERMISSION_DENIED");
  });
});
