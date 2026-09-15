import { describe, expect, it } from "vitest";
import {
  SkillManagementError,
  archiveOwnedSkill,
  restoreOwnedSkill,
  updateOwnedSkill,
} from "../lib/registry/management";

type SkillState = {
  id: string;
  slug: string;
  ownerId: string | null;
  status: "PUBLISHED" | "ARCHIVED" | "DRAFT";
  displayName: string;
  description: string;
  categoryId: string;
};

function createManagementFixture(
  overrides: Partial<SkillState> = {},
) {
  const state: SkillState = {
    id: "skill-1",
    slug: "demo-skill",
    ownerId: "owner-1",
    status: "PUBLISHED",
    displayName: "Demo Skill",
    description: "原始描述",
    categoryId: "category-1",
    ...overrides,
  };
  const categories = [
    { id: "category-1", slug: "frontend", name: "前端" },
    { id: "category-2", slug: "backend", name: "后端" },
  ];
  const tags = new Map<string, { id: string; slug: string; name: string }>();
  const skillTags: Array<{ skillId: string; tagId: string }> = [];
  let transactionCalls = 0;

  const client = {
    category: {
      findFirst: async ({ where }: any) =>
        categories.find((category) =>
          where.OR.some(
            (condition: any) =>
              condition.slug === category.slug ||
              condition.name === category.name,
          ),
        ) ?? null,
    },
    skill: {
      findUnique: async ({ where }: any) =>
        where.slug === state.slug
          ? {
              id: state.id,
              ownerId: state.ownerId,
              status: state.status,
            }
          : null,
      update: async ({ data }: any) => {
        Object.assign(state, data);
        return { id: state.id, slug: state.slug, updatedAt: new Date() };
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== state.id ||
          where.ownerId !== state.ownerId ||
          where.status !== state.status
        ) {
          return { count: 0 };
        }
        Object.assign(state, data);
        return { count: 1 };
      },
    },
    tag: {
      upsert: async ({ where, create }: any) => {
        const existing = tags.get(where.slug);
        if (existing) return { id: existing.id };
        const tag = {
          id: `tag-${tags.size + 1}`,
          slug: create.slug,
          name: create.name,
        };
        tags.set(tag.slug, tag);
        return { id: tag.id };
      },
    },
    skillTag: {
      deleteMany: async () => {
        skillTags.splice(0, skillTags.length);
      },
      createMany: async ({ data }: any) => {
        skillTags.push(...data);
        return { count: data.length };
      },
    },
  };

  return {
    state,
    tags,
    skillTags,
    client: client as any,
    transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
      transactionCalls += 1;
      return callback(client);
    },
    get transactionCalls() {
      return transactionCalls;
    },
  };
}

describe("Skill owner management service", () => {
  it("allows the Owner to edit public fields and replaces tags in one transaction", async () => {
    const fixture = createManagementFixture();

    await updateOwnedSkill(
      "demo-skill",
      "owner-1",
      {
        displayName: "新的展示名称",
        description: "新的描述",
        category: "后端",
        tags: ["API", "api", "服务端"],
      },
      { db: fixture.client, transaction: fixture.transaction },
    );

    expect(fixture.state).toMatchObject({
      displayName: "新的展示名称",
      description: "新的描述",
      categoryId: "category-2",
    });
    expect(fixture.tags.size).toBe(2);
    expect(fixture.skillTags).toHaveLength(2);
    expect(fixture.transactionCalls).toBe(1);
  });

  it("rejects a non-Owner and does not update the Skill", async () => {
    const fixture = createManagementFixture();

    await expect(
      updateOwnedSkill(
        "demo-skill",
        "owner-2",
        { displayName: "不应保存" },
        { db: fixture.client, transaction: fixture.transaction },
      ),
    ).rejects.toHaveProperty("code", "SKILL_PERMISSION_DENIED");

    expect(fixture.state.displayName).toBe("Demo Skill");
    expect(fixture.transactionCalls).toBe(1);
  });

  it("allows only PUBLISHED to ARCHIVED and ARCHIVED to PUBLISHED", async () => {
    const fixture = createManagementFixture();

    await archiveOwnedSkill("demo-skill", "owner-1", { db: fixture.client });
    expect(fixture.state.status).toBe("ARCHIVED");

    await expect(
      archiveOwnedSkill("demo-skill", "owner-1", { db: fixture.client }),
    ).rejects.toMatchObject({ code: "SKILL_STATUS_INVALID" });

    await restoreOwnedSkill("demo-skill", "owner-1", { db: fixture.client });
    expect(fixture.state.status).toBe("PUBLISHED");
  });

  it("does not allow a historical Skill without an Owner to be managed", async () => {
    const fixture = createManagementFixture({ ownerId: null });

    await expect(
      restoreOwnedSkill("demo-skill", "owner-1", { db: fixture.client }),
    ).rejects.toMatchObject({ code: "SKILL_PERMISSION_DENIED" });
  });
});
