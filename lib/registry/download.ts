import { type PrismaClient } from "@prisma/client";
import { getConfiguredPrisma } from "../db/client";
import {
  getConfiguredSkillPackageStorage,
  isSafeSkillPackageSlug,
  isSafeSkillPackageVersion,
  isSkillPackageStoragePath,
  SkillPackageStorageError,
  type SkillPackageStorage,
} from "../storage/package";

export type SkillPackageDownloadErrorCode =
  | "SLUG_INVALID"
  | "VERSION_INVALID"
  | "SKILL_NOT_FOUND"
  | "SKILL_VERSION_NOT_FOUND"
  | "PACKAGE_NOT_AVAILABLE"
  | "STORAGE_PATH_INVALID"
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_OBJECT_NOT_FOUND"
  | "STORAGE_DOWNLOAD_FAILED"
  | "DOWNLOAD_STATS_FAILED"
  | "DATABASE_NOT_CONFIGURED";

export type SkillPackageDownloadResult =
  | {
      kind: "success";
      fileName: string;
      content: Uint8Array;
      version: string;
      storagePath: string;
      packageSize: number | null;
      packageHash: string | null;
    }
  | {
      kind: "error";
      error: {
        code: SkillPackageDownloadErrorCode;
        message: string;
      };
    };

type DownloadDbClient = Pick<PrismaClient, "skill">;

export type DownloadSkillPackageOptions = {
  version?: string;
  viewerId?: string;
};

export type DownloadSkillPackageDependencies = {
  db?: DownloadDbClient;
  storage?: Pick<SkillPackageStorage, "download">;
};

function safeFileName(slug: string, version: string) {
  return `${slug}-${version}.zip`.replace(/[^a-zA-Z0-9._+-]/g, "-");
}

function storageDownloadError(error: unknown): SkillPackageDownloadResult {
  if (error instanceof SkillPackageStorageError) {
    if (error.code === "STORAGE_NOT_CONFIGURED") {
      return {
        kind: "error",
        error: {
          code: "STORAGE_NOT_CONFIGURED",
          message: "未配置 Supabase Storage 服务端环境变量，暂时无法下载。",
        },
      };
    }

    if (error.code === "STORAGE_OBJECT_NOT_FOUND") {
      return {
        kind: "error",
        error: {
          code: "STORAGE_OBJECT_NOT_FOUND",
          message: "技能包文件不存在或已被移除。",
        },
      };
    }
  }

  return {
    kind: "error",
    error: {
      code: "STORAGE_DOWNLOAD_FAILED",
      message: "无法从私有 Storage 下载技能包。",
    },
  };
}

export async function downloadSkillPackage(
  slug: string,
  options: DownloadSkillPackageOptions = {},
  dependencies: DownloadSkillPackageDependencies = {},
): Promise<SkillPackageDownloadResult> {
  const normalizedSlug = slug.trim();
  if (!isSafeSkillPackageSlug(normalizedSlug)) {
    return {
      kind: "error",
      error: {
        code: "SLUG_INVALID",
        message: "Skill slug 无效。",
      },
    };
  }

  const requestedVersion = options.version?.trim();
  if (
    requestedVersion !== undefined &&
    !isSafeSkillPackageVersion(requestedVersion)
  ) {
    return {
      kind: "error",
      error: {
        code: "VERSION_INVALID",
        message: "版本号无效。",
      },
    };
  }

  let db = dependencies.db;
  if (!db) {
    try {
      db = getConfiguredPrisma();
    } catch {
      return {
        kind: "error",
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "当前未配置可用的 PostgreSQL 数据库，暂时无法下载。",
        },
      };
    }
  }
  if (!db) {
    return {
      kind: "error",
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "当前未配置可用的 PostgreSQL 数据库，暂时无法下载。",
      },
    };
  }

  const skill = await db.skill.findFirst({
    where: {
      slug: normalizedSlug,
      OR: [
        { status: "PUBLISHED" },
        ...(options.viewerId
          ? [{ status: "ARCHIVED" as const, ownerId: options.viewerId }]
          : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      ownerId: true,
      versions: {
        where: {
          publishedAt: { not: null },
          ...(requestedVersion ? { version: requestedVersion } : {}),
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          version: true,
          storagePath: true,
          packageSize: true,
          packageHash: true,
        },
      },
    },
  });

  if (!skill) {
    return {
      kind: "error",
      error: {
        code: "SKILL_NOT_FOUND",
        message: "未找到这个 Skill。",
      },
    };
  }

  const version = skill.versions[0];
  if (!version) {
    return {
      kind: "error",
      error: {
        code: "SKILL_VERSION_NOT_FOUND",
        message: "未找到可下载的发布版本。",
      },
    };
  }

  if (!version.storagePath) {
    return {
      kind: "error",
      error: {
        code: "PACKAGE_NOT_AVAILABLE",
        message: "该技能暂未提供完整技能包。",
      },
    };
  }

  if (
    !isSkillPackageStoragePath(
      version.storagePath,
      normalizedSlug,
      version.version,
    )
  ) {
    return {
      kind: "error",
      error: {
        code: "STORAGE_PATH_INVALID",
        message: "数据库中的技能包存储路径无效。",
      },
    };
  }

  let storage = dependencies.storage;
  if (!storage) {
    try {
      storage = getConfiguredSkillPackageStorage();
    } catch (error) {
      return storageDownloadError(error);
    }
  }

  let content: Uint8Array;
  try {
    content = await storage.download(version.storagePath);
  } catch (error) {
    return storageDownloadError(error);
  }

  try {
    await db.skill.update({
      where: { id: skill.id },
      data: { downloads: { increment: 1 } },
      select: { id: true },
    });
  } catch {
    return {
      kind: "error",
      error: {
        code: "DOWNLOAD_STATS_FAILED",
        message: "技能包已读取，但下载统计更新失败。",
      },
    };
  }

  return {
    kind: "success",
    fileName: safeFileName(normalizedSlug, version.version),
    content,
    version: version.version,
    storagePath: version.storagePath,
    packageSize: version.packageSize,
    packageHash: version.packageHash,
  };
}
