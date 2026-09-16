import type { PrismaClient } from "@prisma/client";

import { getConfiguredPrisma } from "../db/client";
import {
  publicSkillWhere,
  publicVersionInclude,
  toSkillView,
  type DatabaseSkill,
} from "./database";
import { measureAsync } from "../diagnostics/timing";
import type { SkillView } from "./types";

export type FavoriteErrorCode =
  | "SKILL_NOT_FOUND"
  | "DATABASE_NOT_CONFIGURED"
  | "FAVORITE_FAILED";

export class FavoriteError extends Error {
  readonly code: FavoriteErrorCode;

  constructor(code: FavoriteErrorCode, message: string) {
    super(message);
    this.name = "FavoriteError";
    this.code = code;
  }
}

export type FavoriteDbClient = Pick<PrismaClient, "skill" | "skillFavorite">;

type FavoriteDependencies = {
  db?: FavoriteDbClient;
};

function getDatabase(dependencies: FavoriteDependencies): FavoriteDbClient {
  if (dependencies.db) return dependencies.db;

  try {
    return getConfiguredPrisma();
  } catch {
    throw new FavoriteError(
      "DATABASE_NOT_CONFIGURED",
      "当前未配置可用的 PostgreSQL 数据库，暂时无法管理收藏。",
    );
  }
}

function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

async function findPublicSkill(
  db: Pick<FavoriteDbClient, "skill">,
  slug: string,
) {
  if (!isValidSlug(slug)) return null;

  return db.skill.findFirst({
    where: { ...publicSkillWhere, slug },
    select: { id: true },
  });
}

export async function getFavoriteStatus(
  userId: string,
  skillId: string,
  dependencies: FavoriteDependencies = {},
): Promise<boolean> {
  const db = getDatabase(dependencies);
  const favorite = await measureAsync(
    "FAVORITES query",
    "favorite status",
    () =>
      db.skillFavorite.findUnique({
        where: {
          userId_skillId: { userId, skillId },
        },
        select: { userId: true },
      }),
  );

  return Boolean(favorite);
}

export async function getFavoriteStatusForSlug(
  userId: string,
  slug: string,
  dependencies: FavoriteDependencies = {},
): Promise<boolean> {
  const db = getDatabase(dependencies);
  const skill = await measureAsync(
    "FAVORITES query",
    "public skill lookup",
    () => findPublicSkill(db, slug),
  );
  if (!skill) return false;

  return getFavoriteStatus(userId, skill.id, { db });
}

export async function favoriteSkill(
  userId: string,
  slug: string,
  dependencies: FavoriteDependencies = {},
): Promise<{ favorited: true }> {
  const db = getDatabase(dependencies);
  const skill = await findPublicSkill(db, slug);

  if (!skill) {
    throw new FavoriteError(
      "SKILL_NOT_FOUND",
      "未找到这个公开 Skill。",
    );
  }

  await db.skillFavorite.upsert({
    where: {
      userId_skillId: { userId, skillId: skill.id },
    },
    update: {},
    create: { userId, skillId: skill.id },
  });

  return { favorited: true };
}

export async function unfavoriteSkill(
  userId: string,
  slug: string,
  dependencies: FavoriteDependencies = {},
): Promise<{ favorited: false }> {
  const db = getDatabase(dependencies);
  const skill = await findPublicSkill(db, slug);

  if (!skill) {
    throw new FavoriteError(
      "SKILL_NOT_FOUND",
      "未找到这个公开 Skill。",
    );
  }

  await db.skillFavorite.deleteMany({
    where: { userId, skillId: skill.id },
  });

  return { favorited: false };
}

export async function getFavoriteSkillsForUser(
  userId: string,
  dependencies: FavoriteDependencies = {},
): Promise<SkillView[]> {
  const db = getDatabase(dependencies);
  const favorites = await measureAsync(
    "FAVORITES query",
    "favorite skills",
    () =>
      db.skillFavorite.findMany({
        where: {
          userId,
          skill: publicSkillWhere,
        },
        orderBy: { createdAt: "desc" },
        include: {
          skill: {
            include: {
              category: true,
              owner: true,
              skillTags: {
                include: { tag: true },
                orderBy: { tag: { name: "asc" } },
              },
              versions: publicVersionInclude,
            },
          },
        },
      }),
  );

  return favorites.map(({ skill }) =>
    toSkillView(skill as DatabaseSkill),
  );
}
