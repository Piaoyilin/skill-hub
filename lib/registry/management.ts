import { Prisma, type PrismaClient } from "@prisma/client";
import { getConfiguredPrisma } from "../db/client";
import { normalizeTags, tagSlug } from "./publish";

export type SkillManagementErrorCode =
  | "SKILL_NOT_FOUND"
  | "SKILL_PERMISSION_DENIED"
  | "SKILL_STATUS_INVALID"
  | "SKILL_UPDATE_INVALID"
  | "CATEGORY_NOT_FOUND"
  | "DATABASE_NOT_CONFIGURED"
  | "SKILL_MANAGEMENT_FAILED";

export class SkillManagementError extends Error {
  readonly code: SkillManagementErrorCode;

  constructor(code: SkillManagementErrorCode, message: string) {
    super(message);
    this.name = "SkillManagementError";
    this.code = code;
  }
}

export type SkillUpdateInput = {
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
};

export type SkillManagementDbClient = Pick<
  PrismaClient,
  "category" | "skill" | "tag" | "skillTag"
>;

export type SkillManagementTransactionClient = Pick<
  Prisma.TransactionClient,
  "category" | "skill" | "tag" | "skillTag"
>;

export type SkillManagementTransactionRunner = <T>(
  callback: (tx: SkillManagementTransactionClient) => Promise<T>,
) => Promise<T>;

type ManagedSkillRecord = {
  id: string;
  ownerId: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

function assertValidSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new SkillManagementError("SKILL_NOT_FOUND", "未找到这个 Skill。");
  }
}

function assertOwner(
  skill: ManagedSkillRecord | null,
  ownerId: string,
): asserts skill is ManagedSkillRecord {
  if (!skill) {
    throw new SkillManagementError("SKILL_NOT_FOUND", "未找到这个 Skill。");
  }

  if (!skill.ownerId || skill.ownerId !== ownerId) {
    throw new SkillManagementError(
      "SKILL_PERMISSION_DENIED",
      "你不是该 Skill 的 Owner，不能管理它。",
    );
  }
}

function normalizeText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new SkillManagementError(
      "SKILL_UPDATE_INVALID",
      `${label}不能为空，且不能超过 ${maxLength} 个字符。`,
    );
  }

  return normalized;
}

function preparedUpdate(input: SkillUpdateInput) {
  const data: {
    displayName?: string;
    description?: string;
    categoryId?: string;
    updatedAt?: Date;
  } = {};

  if (input.displayName !== undefined) {
    data.displayName = normalizeText(input.displayName, "展示名称", 200);
  }

  if (input.description !== undefined) {
    data.description = normalizeText(input.description, "描述", 5000);
  }

  return data;
}

async function findOwnedSkill(
  db: Pick<SkillManagementDbClient, "skill">,
  slug: string,
  ownerId: string,
) {
  assertValidSlug(slug);
  const skill = await db.skill.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true },
  });
  assertOwner(skill, ownerId);
  return skill;
}

function getTransaction(
  db: SkillManagementDbClient,
  transaction?: SkillManagementTransactionRunner,
) {
  return (
    transaction ??
    (<T>(callback: (tx: SkillManagementTransactionClient) => Promise<T>) =>
      (db as PrismaClient).$transaction((tx) => callback(tx)))
  );
}

export async function updateOwnedSkill(
  slug: string,
  ownerId: string,
  input: SkillUpdateInput,
  dependencies: {
    db?: SkillManagementDbClient;
    transaction?: SkillManagementTransactionRunner;
  } = {},
) {
  if (
    input.displayName === undefined &&
    input.description === undefined &&
    input.category === undefined &&
    input.tags === undefined
  ) {
    throw new SkillManagementError(
      "SKILL_UPDATE_INVALID",
      "请至少修改一项基本信息。",
    );
  }

  let db = dependencies.db;
  if (!db) {
    try {
      db = getConfiguredPrisma();
    } catch {
      throw new SkillManagementError(
        "DATABASE_NOT_CONFIGURED",
        "当前未配置可用的 PostgreSQL 数据库，暂时无法管理 Skill。",
      );
    }
  }

  const transaction = getTransaction(db, dependencies.transaction);
  return transaction(async (tx) => {
    const skill = await findOwnedSkill(tx, slug, ownerId);
    const data = preparedUpdate(input);

    if (input.category !== undefined) {
      const categoryName = input.category.trim();
      if (!categoryName) {
        throw new SkillManagementError(
          "SKILL_UPDATE_INVALID",
          "分类不能为空。",
        );
      }

      const category = await tx.category.findFirst({
        where: {
          OR: [{ slug: categoryName }, { name: categoryName }],
        },
        select: { id: true },
      });
      if (!category) {
        throw new SkillManagementError(
          "CATEGORY_NOT_FOUND",
          "所选分类不存在，请选择已有分类。",
        );
      }
      data.categoryId = category.id;
    }

    const normalizedTags =
      input.tags === undefined ? undefined : normalizeTags(input.tags);

    if (normalizedTags !== undefined && Object.keys(data).length === 0) {
      data.updatedAt = new Date();
    }

    const updated = await tx.skill.update({
      where: { id: skill.id },
      data,
      select: { id: true, slug: true, updatedAt: true },
    });

    if (normalizedTags !== undefined) {
      const tagIds: string[] = [];
      for (const name of normalizedTags) {
        const tag = await tx.tag.upsert({
          where: {
            slug: tagSlug(name),
          },
          update: { name },
          create: {
            slug: tagSlug(name),
            name,
          },
          select: { id: true },
        });
        tagIds.push(tag.id);
      }

      await tx.skillTag.deleteMany({ where: { skillId: skill.id } });
      if (tagIds.length > 0) {
        await tx.skillTag.createMany({
          data: tagIds.map((tagId) => ({ skillId: skill.id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  });
}

type StatusTransition = {
  from: "PUBLISHED" | "ARCHIVED";
  to: "ARCHIVED" | "PUBLISHED";
};

export async function changeOwnedSkillStatus(
  slug: string,
  ownerId: string,
  transition: StatusTransition,
  dependencies: { db?: SkillManagementDbClient } = {},
) {
  let db = dependencies.db;
  if (!db) {
    try {
      db = getConfiguredPrisma();
    } catch {
      throw new SkillManagementError(
        "DATABASE_NOT_CONFIGURED",
        "当前未配置可用的 PostgreSQL 数据库，暂时无法管理 Skill。",
      );
    }
  }

  const skill = await findOwnedSkill(db, slug, ownerId);
  if (skill.status !== transition.from) {
    throw new SkillManagementError(
      "SKILL_STATUS_INVALID",
      transition.from === "PUBLISHED"
        ? "只有已发布的 Skill 才能下架。"
        : "只有已下架的 Skill 才能重新上架。",
    );
  }

  const result = await db.skill.updateMany({
    where: {
      id: skill.id,
      ownerId,
      status: transition.from,
    },
    data: { status: transition.to },
  });

  if (result.count !== 1) {
    throw new SkillManagementError(
      "SKILL_STATUS_INVALID",
      "Skill 状态已经发生变化，请刷新后重试。",
    );
  }

  return { id: skill.id, slug, status: transition.to };
}

export async function archiveOwnedSkill(
  slug: string,
  ownerId: string,
  dependencies: { db?: SkillManagementDbClient } = {},
) {
  return changeOwnedSkillStatus(slug, ownerId, {
    from: "PUBLISHED",
    to: "ARCHIVED",
  }, dependencies);
}

export async function restoreOwnedSkill(
  slug: string,
  ownerId: string,
  dependencies: { db?: SkillManagementDbClient } = {},
) {
  return changeOwnedSkillStatus(slug, ownerId, {
    from: "ARCHIVED",
    to: "PUBLISHED",
  }, dependencies);
}
