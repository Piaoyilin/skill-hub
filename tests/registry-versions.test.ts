import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfiguredPrisma } = vi.hoisted(() => ({
  getConfiguredPrisma: vi.fn(),
}));

vi.mock("../lib/db/client", () => ({
  getConfiguredPrisma,
}));

import { getDatabaseSkillBySlug } from "../lib/registry/database";

type VersionFixture = {
  version: string;
  publishedAt: Date | null;
  createdAt: Date;
  changelog: unknown;
  skillMd: string;
  storagePath: string | null;
  files: [];
};

function createSkill(versions: VersionFixture[]) {
  return {
    slug: "owner-auth-test-20260915",
    displayName: "Owner Auth Test",
    description: "用于验证版本记录的 Skill。",
    authorDisplayName: "测试用户",
    authorHandle: "tester",
    category: { name: "前端" },
    skillTags: [],
    owner: null,
    downloads: 0,
    stars: 0,
    updatedAt: new Date("2026-09-15T10:00:00.000Z"),
    createdAt: new Date("2026-09-15T09:00:00.000Z"),
    icon: "S",
    accent: "indigo",
    verified: false,
    featured: false,
    versions,
  };
}

function version(
  value: string,
  publishedAt: string,
  changelog: unknown = [],
): VersionFixture {
  return {
    version: value,
    publishedAt: new Date(publishedAt),
    createdAt: new Date(publishedAt),
    changelog,
    skillMd: `---\nname: demo\ndescription: demo\n---\n`,
    storagePath: null,
    files: [],
  };
}

function setupDatabaseSkill(versions: VersionFixture[]) {
  getConfiguredPrisma.mockReturnValue({
    skill: {
      findFirst: vi.fn().mockResolvedValue(createSkill(versions)),
    },
  });
}

describe("database Skill version history mapping", () => {
  beforeEach(() => {
    getConfiguredPrisma.mockReset();
  });

  it("returns all published versions in newest-first order and marks the current version", async () => {
    setupDatabaseSkill([
      version("1.1.0", "2026-09-15T10:00:00.000Z"),
      version("1.0.0", "2026-09-15T09:00:00.000Z"),
    ]);

    const skill = await getDatabaseSkillBySlug("owner-auth-test-20260915");

    expect(skill?.versions).toEqual([
      {
        version: "1.1.0",
        publishedAt: "2026-09-15",
        changelog: [],
        isCurrent: true,
      },
      {
        version: "1.0.0",
        publishedAt: "2026-09-15",
        changelog: [],
        isCurrent: false,
      },
    ]);

    const query = getConfiguredPrisma.mock.results[0]?.value.skill.findFirst
      .mock.calls[0]?.[0];
    expect(query.include.versions.take).toBeUndefined();
    expect(query.include.versions.orderBy).toEqual([
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ]);
  });

  it("maps a single published version", async () => {
    setupDatabaseSkill([version("1.0.0", "2026-09-15T10:00:00.000Z")]);

    const skill = await getDatabaseSkillBySlug("owner-auth-test-20260915");

    expect(skill?.versions).toHaveLength(1);
    expect(skill?.versions[0]).toMatchObject({
      version: "1.0.0",
      isCurrent: true,
    });
  });

  it("preserves an empty version history for a Skill without published versions", async () => {
    setupDatabaseSkill([]);

    const skill = await getDatabaseSkillBySlug("owner-auth-test-20260915");

    expect(skill).not.toBeNull();
    expect(skill?.versions).toEqual([]);
  });
});
