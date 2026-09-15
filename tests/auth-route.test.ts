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
});
