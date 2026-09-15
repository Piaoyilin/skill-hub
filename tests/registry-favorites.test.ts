import { describe, expect, it } from "vitest";

import {
  favoriteSkill,
  getFavoriteSkillsForUser,
  getFavoriteStatus,
  unfavoriteSkill,
} from "../lib/registry/favorites";
import {
  archiveOwnedSkill,
  restoreOwnedSkill,
} from "../lib/registry/management";

type SkillState = {
  id: string;
  slug: string;
  status: "PUBLISHED" | "ARCHIVED" | "DRAFT";
  ownerId: string;
  displayName: string;
};

function createFavoritesFixture() {
  const skills: SkillState[] = [
    {
      id: "skill-public-1",
      slug: "public-one",
      status: "PUBLISHED",
      ownerId: "owner-1",
      displayName: "Public One",
    },
    {
      id: "skill-public-2",
      slug: "public-two",
      status: "PUBLISHED",
      ownerId: "owner-2",
      displayName: "Public Two",
    },
    {
      id: "skill-archived",
      slug: "archived-one",
      status: "ARCHIVED",
      ownerId: "owner-1",
      displayName: "Archived One",
    },
    {
      id: "skill-draft",
      slug: "draft-one",
      status: "DRAFT",
      ownerId: "owner-1",
      displayName: "Draft One",
    },
  ];
  const favorites = new Map<
    string,
    { userId: string; skillId: string; createdAt: Date }
  >();

  function publicSkillView(skill: SkillState) {
    return {
      id: skill.id,
      slug: skill.slug,
      displayName: skill.displayName,
      description: `${skill.displayName} description`,
      category: { name: "前端" },
      skillTags: [{ tag: { name: "React" } }],
      owner: {
        id: skill.ownerId,
        username: skill.ownerId,
        displayName: skill.ownerId,
        avatarUrl: null,
      },
      authorDisplayName: skill.ownerId,
      authorHandle: skill.ownerId,
      downloads: 0,
      stars: 0,
      updatedAt: new Date("2026-09-15T10:00:00.000Z"),
      createdAt: new Date("2026-09-15T09:00:00.000Z"),
      icon: "S",
      accent: "indigo",
      verified: false,
      featured: false,
      versions: [
        {
          version: "1.0.0",
          publishedAt: new Date("2026-09-15T10:00:00.000Z"),
          createdAt: new Date("2026-09-15T10:00:00.000Z"),
          changelog: [],
          skillMd: "---\nname: demo\ndescription: demo\n---\n\nContent",
          storagePath: null,
          files: [],
        },
      ],
    };
  }

  const db = {
    skill: {
      findFirst: async ({ where, select }: any) => {
        const skill = skills.find(
          (item) =>
            item.slug === where.slug &&
            (!where.status || item.status === where.status),
        );
        if (!skill) return null;
        return select?.id ? { id: skill.id } : publicSkillView(skill);
      },
      findUnique: async ({ where }: any) => {
        const skill = skills.find((item) => item.slug === where.slug);
        return skill
          ? { id: skill.id, ownerId: skill.ownerId, status: skill.status }
          : null;
      },
      updateMany: async ({ where, data }: any) => {
        const skill = skills.find(
          (item) =>
            item.id === where.id &&
            item.ownerId === where.ownerId &&
            item.status === where.status,
        );
        if (!skill) return { count: 0 };
        Object.assign(skill, data);
        return { count: 1 };
      },
    },
    skillFavorite: {
      findUnique: async ({ where }: any) => {
        const key = `${where.userId_skillId.userId}:${where.userId_skillId.skillId}`;
        return favorites.has(key) ? { userId: where.userId_skillId.userId } : null;
      },
      upsert: async ({ where, create }: any) => {
        const key = `${where.userId_skillId.userId}:${where.userId_skillId.skillId}`;
        const existing = favorites.get(key);
        if (existing) return existing;
        const record = { ...create, createdAt: new Date() };
        favorites.set(key, record);
        return record;
      },
      deleteMany: async ({ where }: any) => {
        const key = `${where.userId}:${where.skillId}`;
        return { count: favorites.delete(key) ? 1 : 0 };
      },
      findMany: async ({ where }: any) => {
        return [...favorites.values()]
          .filter((favorite) => {
            const skill = skills.find((item) => item.id === favorite.skillId);
            return (
              favorite.userId === where.userId &&
              skill?.status === where.skill.status
            );
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((favorite) => ({
            ...favorite,
            skill: publicSkillView(
              skills.find((item) => item.id === favorite.skillId)!,
            ),
          }));
      },
    },
    category: {},
    tag: {},
    skillTag: {},
  };

  return { db: db as any, skills, favorites };
}

describe("Skill favorites service", () => {
  it("favorites a published Skill idempotently and uses the Prisma profile id", async () => {
    const fixture = createFavoritesFixture();

    await favoriteSkill("profile-user-a", "public-one", { db: fixture.db });
    await favoriteSkill("profile-user-a", "public-one", { db: fixture.db });

    expect(fixture.favorites.size).toBe(1);
    await expect(
      getFavoriteStatus("profile-user-a", "skill-public-1", {
        db: fixture.db,
      }),
    ).resolves.toBe(true);
  });

  it("cancels a favorite idempotently", async () => {
    const fixture = createFavoritesFixture();

    await favoriteSkill("profile-user-a", "public-one", { db: fixture.db });
    await unfavoriteSkill("profile-user-a", "public-one", { db: fixture.db });
    await unfavoriteSkill("profile-user-a", "public-one", { db: fixture.db });

    expect(fixture.favorites.size).toBe(0);
    await expect(
      getFavoriteStatus("profile-user-a", "skill-public-1", {
        db: fixture.db,
      }),
    ).resolves.toBe(false);
  });

  it("does not allow ordinary users to favorite archived, draft, or missing Skills", async () => {
    const fixture = createFavoritesFixture();

    for (const slug of ["archived-one", "draft-one", "missing-one"]) {
      await expect(
        favoriteSkill("profile-user-a", slug, { db: fixture.db }),
      ).rejects.toMatchObject({ code: "SKILL_NOT_FOUND" });
    }

    expect(fixture.favorites.size).toBe(0);
  });

  it("isolates users and sorts each user's favorites by newest favorite time", async () => {
    const fixture = createFavoritesFixture();

    await favoriteSkill("profile-user-a", "public-one", { db: fixture.db });
    await favoriteSkill("profile-user-a", "public-two", { db: fixture.db });
    await favoriteSkill("profile-user-b", "public-one", { db: fixture.db });

    fixture.favorites.get("profile-user-a:skill-public-1")!.createdAt = new Date(
      "2026-09-15T10:00:00.000Z",
    );
    fixture.favorites.get("profile-user-a:skill-public-2")!.createdAt = new Date(
      "2026-09-15T11:00:00.000Z",
    );

    const userAFavorites = await getFavoriteSkillsForUser("profile-user-a", {
      db: fixture.db,
    });
    const userBFavorites = await getFavoriteSkillsForUser("profile-user-b", {
      db: fixture.db,
    });

    expect(userAFavorites.map((skill) => skill.slug)).toEqual([
      "public-two",
      "public-one",
    ]);
    expect(userBFavorites.map((skill) => skill.slug)).toEqual(["public-one"]);
  });

  it("keeps the Favorite relation through archive and makes it visible again after restore", async () => {
    const fixture = createFavoritesFixture();

    await favoriteSkill("owner-1", "public-one", { db: fixture.db });
    await archiveOwnedSkill("public-one", "owner-1", { db: fixture.db });

    await expect(
      getFavoriteSkillsForUser("owner-1", { db: fixture.db }),
    ).resolves.toEqual([]);
    expect(fixture.favorites.has("owner-1:skill-public-1")).toBe(true);

    await restoreOwnedSkill("public-one", "owner-1", { db: fixture.db });

    await expect(
      getFavoriteSkillsForUser("owner-1", { db: fixture.db }),
    ).resolves.toHaveLength(1);
  });
});
