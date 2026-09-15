import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfiguredPrisma } = vi.hoisted(() => ({
  getConfiguredPrisma: vi.fn(),
}));

vi.mock("../lib/db/client", () => ({ getConfiguredPrisma }));

import {
  getDatabaseOwnedSkillBySlug,
  getDatabaseSkillBySlug,
  listDatabaseOwnedSkills,
} from "../lib/registry/database";

function createSkill(status: "PUBLISHED" | "ARCHIVED") {
  return {
    id: "skill-1",
    slug: "demo-skill",
    displayName: "Demo Skill",
    description: "描述",
    authorDisplayName: "作者",
    authorHandle: "owner",
    category: { name: "前端" },
    skillTags: [{ tag: { name: "React" } }],
    owner: {
      id: "owner-1",
      username: "owner",
      displayName: "作者",
      avatarUrl: null,
    },
    downloads: 3,
    stars: 1,
    updatedAt: new Date("2026-09-15T10:00:00.000Z"),
    createdAt: new Date("2026-09-14T10:00:00.000Z"),
    icon: "D",
    accent: "indigo",
    verified: false,
    featured: false,
    status,
    versions: [
      {
        version: "1.1.0",
        publishedAt: new Date("2026-09-15T10:00:00.000Z"),
        createdAt: new Date("2026-09-15T10:00:00.000Z"),
        packageSize: 120,
        storagePath: "skills/demo-skill/1.1.0/skill.zip",
        files: [{ id: "file-1" }, { id: "file-2" }],
      },
      {
        version: "1.0.0",
        publishedAt: new Date("2026-09-14T10:00:00.000Z"),
        createdAt: new Date("2026-09-14T10:00:00.000Z"),
        packageSize: 100,
        storagePath: "skills/demo-skill/1.0.0/skill.zip",
        files: [{ id: "file-3" }],
      },
    ],
  };
}

describe("Owner Registry query", () => {
  beforeEach(() => {
    getConfiguredPrisma.mockReset();
  });

  it("returns all Owner versions newest first, including archived Skills", async () => {
    const findFirst = vi.fn().mockResolvedValue(createSkill("ARCHIVED"));
    getConfiguredPrisma.mockReturnValue({ skill: { findFirst } });

    const skill = await getDatabaseOwnedSkillBySlug("owner-1", "demo-skill");

    expect(skill).toMatchObject({
      slug: "demo-skill",
      status: "ARCHIVED",
      version: "1.1.0",
      versions: [
        {
          version: "1.1.0",
          packageAvailable: true,
          fileCount: 2,
          isCurrent: true,
        },
        {
          version: "1.0.0",
          packageAvailable: true,
          fileCount: 1,
          isCurrent: false,
        },
      ],
    });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      ownerId: "owner-1",
      slug: "demo-skill",
    });
  });

  it("returns null when the Skill is not owned by the current profile", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    getConfiguredPrisma.mockReturnValue({ skill: { findFirst } });

    await expect(
      getDatabaseOwnedSkillBySlug("other-owner", "demo-skill"),
    ).resolves.toBeNull();
  });

  it("keeps archived Skills out of the public Registry query", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    getConfiguredPrisma.mockReturnValue({ skill: { findFirst } });

    await expect(getDatabaseSkillBySlug("demo-skill")).resolves.toBeNull();
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      status: "PUBLISHED",
      slug: "demo-skill",
    });
  });

  it("keeps all Owner statuses in the Dashboard query", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        slug: "archived-skill",
        displayName: "已下架 Skill",
        downloads: 0,
        verified: false,
        featured: false,
        status: "ARCHIVED",
        updatedAt: new Date("2026-09-15T10:00:00.000Z"),
        createdAt: new Date("2026-09-14T10:00:00.000Z"),
        versions: [{ version: "1.0.0" }],
      },
    ]);
    getConfiguredPrisma.mockReturnValue({ skill: { findMany } });

    await expect(listDatabaseOwnedSkills("owner-1")).resolves.toMatchObject([
      { slug: "archived-skill", status: "ARCHIVED", version: "1.0.0" },
    ]);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ ownerId: "owner-1" });
  });
});
