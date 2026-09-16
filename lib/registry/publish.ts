import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getConfiguredPrisma } from "../db/client";
import { DEFAULT_SKILL_LIMITS } from "../skills/constants";
import {
  MAX_NAME_LENGTH,
  isValidSkillName,
  isValidSkillSlug,
  resolveSkillSlug,
  toSkillSlug,
} from "../skills/identity";
import { loadSkillPackageFromZip } from "../skills/zip";
import {
  buildSkillPackageStoragePath,
  getConfiguredSkillPackageStorage,
  SkillPackageStorageError,
  type SkillPackageStorage,
} from "../storage/package";
import type {
  ParsedSkill,
  SkillFile,
  SkillPackageInput,
  ValidationIssue,
  ValidationResult,
} from "../skills/types";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export type PublishSkillFields = {
  category?: string;
  tags?: string[];
  version?: string;
  displayName?: string;
  description?: string;
  slug?: string;
  targetSlug?: string;
};

export type PublishOwner = {
  id: string;
  username: string;
  displayName: string;
};

export type PublishSkillSource = {
  buffer: Uint8Array;
  fileName: string;
};

export type PublishSkillSuccess = {
  kind: "success";
  skill: {
    id: string;
    slug: string;
    version: string;
    url: string;
  };
  validation: ValidationResult;
  warnings: ValidationIssue[];
};

export type PublishSkillFailure =
  | {
      kind: "validation-error";
      validation: ValidationResult;
    }
  | {
      kind: "error";
      error: {
        code: PublishErrorCode;
        message: string;
      };
    };

export type PublishSkillResult = PublishSkillSuccess | PublishSkillFailure;

export type PublishErrorCode =
  | "FILE_TYPE_INVALID"
  | "FILE_EMPTY"
  | "DATABASE_NOT_CONFIGURED"
  | "CATEGORY_REQUIRED"
  | "CATEGORY_NOT_FOUND"
  | "VERSION_REQUIRED"
  | "VERSION_INVALID"
  | "NAME_INVALID"
  | "DISPLAY_NAME_INVALID"
  | "SLUG_INVALID"
  | "SKILL_PERMISSION_DENIED"
  | "SKILL_VERSION_EXISTS"
  | "SKILL_SLUG_EXISTS"
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_PATH_EXISTS"
  | "STORAGE_UPLOAD_FAILED"
  | "PUBLISH_COMPENSATION_FAILED"
  | "DATABASE_PREFLIGHT_FAILED"
  | "PUBLISH_FAILED";

export type PublishTransactionClient = Pick<
  Prisma.TransactionClient,
  "category" | "skill" | "skillVersion" | "skillFile" | "tag" | "skillTag"
>;

export type PublishTransactionRunner = <T>(
  callback: (tx: PublishTransactionClient) => Promise<T>,
) => Promise<T>;

export type PublishPreflightInput = {
  slug: string;
  version: string;
  category: string;
  targetSlug?: string;
  owner?: PublishOwner;
};

export type PublishPreflightRunner = (
  input: PublishPreflightInput,
) => Promise<void>;

type PreparedPublication = {
  packageInput: SkillPackageInput;
  parsedSkill: ParsedSkill;
  validation: ValidationResult;
  name: string;
  description: string;
  displayName: string;
  skillMd: string;
  slug: string;
  targetSlug?: string;
  version: string;
  category: string;
  tags: string[];
  packageBytes: Uint8Array;
  storagePath: string;
  packageSize: number;
  packageHash: string;
};

export class PublishDomainError extends Error {
  readonly code: PublishErrorCode;

  constructor(code: PublishErrorCode, message: string) {
    super(message);
    this.name = "PublishDomainError";
    this.code = code;
  }
}

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
): ValidationIssue {
  return { severity, code, message };
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function isValidVersion(value: string) {
  return SEMVER_PATTERN.test(value);
}

function normalizeTags(values: readonly string[] | undefined) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values ?? []) {
    for (const part of rawValue.split(",")) {
      const name = part.trim();
      if (!name) continue;

      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      result.push(name);
    }
  }

  return result;
}

function resolveCategory(
  fields: PublishSkillFields,
  parsedSkill: ParsedSkill,
) {
  const explicit = fields.category?.trim();
  if (explicit) return explicit;

  const rawCategory = parsedSkill.rawFrontmatter.category;
  if (typeof rawCategory === "string" && rawCategory.trim()) {
    return rawCategory.trim();
  }

  const metadataCategory = parsedSkill.manifest.metadata?.category;
  return typeof metadataCategory === "string" && metadataCategory.trim()
    ? metadataCategory.trim()
    : undefined;
}

function resolveDisplayName(parsedSkill: ParsedSkill, fallback: string) {
  const direct =
    parsedSkill.rawFrontmatter.displayName ??
    parsedSkill.rawFrontmatter["display-name"];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const metadata = parsedSkill.manifest.metadata;
  const nested = metadata?.displayName ?? metadata?.["display-name"];
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }

  return fallback;
}

function prepareSlug(
  parsedSkill: ParsedSkill,
  issues: ValidationIssue[],
  explicitSlug?: string,
) {
  const rawSlug = parsedSkill.rawFrontmatter.slug;
  if (explicitSlug?.trim()) {
    const slug = resolveSkillSlug(explicitSlug, parsedSkill.manifest.name ?? "");
    if (!isValidSkillSlug(slug)) {
      issues.push(
        issue(
          "error",
          "SLUG_INVALID",
          "Skill slug 必须是小写 kebab-case，且不能包含路径字符。",
        ),
      );
    }
    return slug;
  }

  if (rawSlug !== undefined && typeof rawSlug !== "string") {
    issues.push(issue("error", "SLUG_TYPE_INVALID", "slug 必须是字符串。"));
    return "";
  }

  const source = typeof rawSlug === "string" ? rawSlug.trim() : "";
  const slug = resolveSkillSlug(source, parsedSkill.manifest.name ?? "");

  if (!isValidSkillSlug(slug)) {
    issues.push(
      issue(
        "error",
        "SLUG_INVALID",
        "Skill slug 必须是小写 kebab-case，且不能包含路径字符。",
      ),
    );
  }

  return slug;
}

function prepareVersion(
  fields: PublishSkillFields,
  parsedSkill: ParsedSkill,
  issues: ValidationIssue[],
) {
  const version =
    fields.version?.trim() || parsedSkill.manifest.version?.trim() || "";

  if (!version) {
    issues.push(
      issue("error", "VERSION_REQUIRED", "发布 Skill 必须提供版本号，例如 1.0.0。"),
    );
  } else if (!isValidVersion(version)) {
    issues.push(
      issue(
        "error",
        "VERSION_INVALID",
        "版本号必须符合 SemVer 格式，例如 1.0.0 或 1.0.0-beta.1。",
      ),
    );
  }

  return version;
}

function appendPublicationIssues(
  validation: ValidationResult,
  parsedSkill: ParsedSkill,
  fields: PublishSkillFields,
) {
  const issues = [...validation.issues];
  const name = parsedSkill.manifest.name?.trim() ?? "";

  if (name && !isValidSkillName(name)) {
    issues.push(
      issue("error", "NAME_INVALID", `Skill name 不能为空且不能超过 ${MAX_NAME_LENGTH} 个字符。`),
    );
  }

  const displayName =
    fields.displayName?.trim() || resolveDisplayName(parsedSkill, name);
  if (displayName && !isValidSkillName(displayName)) {
    issues.push(
      issue(
        "error",
        "DISPLAY_NAME_INVALID",
        "Skill 展示名称不能为空、不能包含换行且不能超过 200 个字符。",
      ),
    );
  }

  prepareSlug(parsedSkill, issues, fields.slug);
  prepareVersion(fields, parsedSkill, issues);

  return {
    ...validation,
    valid: !issues.some((item) => item.severity === "error"),
    issues,
  };
}

function mimeTypeForPath(path: string) {
  if (path === "SKILL.md") return "text/markdown";

  const extension = path.toLowerCase().slice(path.lastIndexOf("."));
  const mimeTypes: Record<string, string> = {
    ".css": "text/css",
    ".csv": "text/csv",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".mjs": "text/javascript",
    ".sh": "text/x-shellscript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".txt": "text/plain",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
  };

  return mimeTypes[extension] ?? null;
}

function fileType(file: SkillFile) {
  return file.type === "directory" ? ("DIRECTORY" as const) : ("FILE" as const);
}

function tagSlug(name: string) {
  return toSkillSlug(name, "tag");
}

function databaseError(error: unknown): PublishSkillFailure {
  if (error instanceof PublishDomainError) {
    return {
      kind: "error",
      error: { code: error.code, message: error.message },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.map(String)
      : typeof error.meta?.target === "string"
        ? [error.meta.target]
        : [];

    if (
      target.includes("version") ||
      target.includes("skillId") ||
      target.some((item) => item.includes("SkillVersion"))
    ) {
      return {
        kind: "error",
        error: {
          code: "SKILL_VERSION_EXISTS",
          message: "该 Skill 版本已经存在。",
        },
      };
    }

    if (
      target.includes("slug") &&
      (target.some((item) => item.includes("Skill")) || target.length === 1)
    ) {
      return {
        kind: "error",
        error: {
          code: "SKILL_SLUG_EXISTS",
          message: "该 Skill slug 已经存在，请发布新版本或更换 slug。",
        },
      };
    }
  }

  return {
    kind: "error",
    error: {
      code: "PUBLISH_FAILED",
      message: "Skill 发布失败，数据库事务已回滚，请稍后重试。",
    },
  };
}

function storageError(error: unknown): PublishSkillFailure {
  if (error instanceof SkillPackageStorageError) {
    const code =
      error.code === "STORAGE_NOT_CONFIGURED"
        ? "STORAGE_NOT_CONFIGURED"
        : error.code === "STORAGE_PATH_EXISTS"
          ? "STORAGE_PATH_EXISTS"
          : "STORAGE_UPLOAD_FAILED";

    const message =
      code === "STORAGE_NOT_CONFIGURED"
        ? "未配置 Supabase Storage 服务端环境变量，暂时无法发布 Skill。"
        : code === "STORAGE_PATH_EXISTS"
          ? "该版本的 Skill ZIP 已存在，不能覆盖已有文件。"
          : "技能包保存到 Supabase Storage 失败，未写入数据库。";

    return { kind: "error", error: { code, message } };
  }

  return {
    kind: "error",
    error: {
      code: "STORAGE_UPLOAD_FAILED",
      message: "技能包保存到 Supabase Storage 失败，未写入数据库。",
    },
  };
}

type PublishPreflightClient = Pick<
  PrismaClient,
  "category" | "skill" | "skillVersion"
>;

async function checkPublishPreflight(
  db: PublishPreflightClient,
  input: PublishPreflightInput,
) {
  const category = await db.category.findFirst({
    where: {
      OR: [{ slug: input.category }, { name: input.category }],
    },
    select: { id: true },
  });

  if (!category) {
    throw new PublishDomainError(
      "CATEGORY_NOT_FOUND",
      "所选分类不存在，请重新选择已有分类。",
    );
  }

  const existing = await db.skill.findUnique({
    where: { slug: input.slug },
    select: { id: true, ownerId: true },
  });

  if (input.targetSlug && input.slug !== input.targetSlug) {
    throw new PublishDomainError(
      "SKILL_PERMISSION_DENIED",
      "目标 Skill 不存在或你没有权限发布新版本。",
    );
  }

  if (!existing) {
    if (input.targetSlug) {
      throw new PublishDomainError(
        "SKILL_PERMISSION_DENIED",
        "目标 Skill 不存在或你没有权限发布新版本。",
      );
    }
    return;
  }

  if (
    input.targetSlug &&
    (!input.owner || existing.ownerId !== input.owner.id)
  ) {
    throw new PublishDomainError(
      "SKILL_PERMISSION_DENIED",
      "目标 Skill 不存在或你没有权限发布新版本。",
    );
  }

  if (input.owner && existing.ownerId !== input.owner.id) {
    throw new PublishDomainError(
      "SKILL_PERMISSION_DENIED",
      "你不是该 Skill 的 Owner，不能发布新版本。",
    );
  }

  const existingVersion = await db.skillVersion.findUnique({
    where: {
      skillId_version: {
        skillId: existing.id,
        version: input.version,
      },
    },
    select: { id: true },
  });

  if (existingVersion) {
    throw new PublishDomainError(
      "SKILL_VERSION_EXISTS",
      "该 Skill 版本已经存在。",
    );
  }
}

async function persistPublication(
  tx: PublishTransactionClient,
  prepared: PreparedPublication,
  owner?: PublishOwner,
) {
  const category = await tx.category.findFirst({
    where: {
      OR: [{ slug: prepared.category }, { name: prepared.category }],
    },
    select: { id: true },
  });

  if (!category) {
    throw new PublishDomainError(
      "CATEGORY_NOT_FOUND",
      "所选分类不存在，请重新选择已有分类。",
    );
  }

  const existing = await tx.skill.findUnique({
    where: { slug: prepared.slug },
    select: { id: true, ownerId: true },
  });

  if (prepared.targetSlug && prepared.slug !== prepared.targetSlug) {
    throw new PublishDomainError(
      "SKILL_PERMISSION_DENIED",
      "目标 Skill 不存在或你没有权限发布新版本。",
    );
  }

  let skillId: string;
  if (existing) {
    if (
      prepared.targetSlug &&
      (!owner || existing.ownerId !== owner.id)
    ) {
      throw new PublishDomainError(
        "SKILL_PERMISSION_DENIED",
        "目标 Skill 不存在或你没有权限发布新版本。",
      );
    }

    if (owner && existing.ownerId !== owner.id) {
      throw new PublishDomainError(
        "SKILL_PERMISSION_DENIED",
        "你不是该 Skill 的 Owner，不能发布新版本。",
      );
    }

    const existingVersion = await tx.skillVersion.findUnique({
      where: {
        skillId_version: {
          skillId: existing.id,
          version: prepared.version,
        },
      },
      select: { id: true },
    });

    if (existingVersion) {
      throw new PublishDomainError(
        "SKILL_VERSION_EXISTS",
        "该 Skill 版本已经存在。",
      );
    }

    const updated = await tx.skill.update({
      where: { id: existing.id },
      data: {
        displayName: prepared.displayName,
        description: prepared.description,
        categoryId: category.id,
        status: "PUBLISHED",
        authorDisplayName:
          prepared.parsedSkill.manifest.author?.trim() || "Skill Hub 用户",
      },
      select: { id: true },
    });
    skillId = updated.id;
  } else {
    if (prepared.targetSlug) {
      throw new PublishDomainError(
        "SKILL_PERMISSION_DENIED",
        "目标 Skill 不存在或你没有权限发布新版本。",
      );
    }

    const created = await tx.skill.create({
      data: {
        slug: prepared.slug,
        displayName: prepared.displayName,
        description: prepared.description,
        categoryId: category.id,
        ...(owner ? { ownerId: owner.id } : {}),
        status: "PUBLISHED",
        authorDisplayName:
          owner?.displayName ||
          prepared.parsedSkill.manifest.author?.trim() ||
          "Skill Hub 用户",
        ...(owner ? { authorHandle: owner.username } : {}),
        icon: (prepared.parsedSkill.manifest.name?.trim() || "S").slice(0, 1),
      },
      select: { id: true },
    });
    skillId = created.id;
  }

  const tagIds: string[] = [];
  for (const name of prepared.tags) {
    const tag = await tx.tag.upsert({
      where: { slug: tagSlug(name) },
      update: { name },
      create: { slug: tagSlug(name), name },
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  if (tagIds.length > 0) {
    await tx.skillTag.createMany({
      data: tagIds.map((tagId) => ({ skillId, tagId })),
      skipDuplicates: true,
    });
  }

  const version = await tx.skillVersion.create({
    data: {
      skillId,
      version: prepared.version,
      skillMd: prepared.skillMd,
      manifest: jsonValue(prepared.parsedSkill.manifest),
      changelog: jsonValue([]),
      storagePath: prepared.storagePath,
      packageSize: prepared.packageSize,
      packageHash: prepared.packageHash,
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  const files = (prepared.packageInput.files ?? []).map((file) => ({
    versionId: version.id,
    path: file.path,
    type: fileType(file),
    sizeBytes: file.type === "directory" ? 0 : Math.max(0, file.sizeBytes ?? 0),
    mimeType: file.type === "directory" ? null : mimeTypeForPath(file.path),
  }));

  if (files.length > 0) {
    await tx.skillFile.createMany({
      data: files,
      skipDuplicates: false,
    });
  }

  return { skillId, version: prepared.version };
}

async function preparePublication(
  source: PublishSkillSource,
  fields: PublishSkillFields,
): Promise<
  | { kind: "ready"; prepared: PreparedPublication }
  | { kind: "validation-error"; validation: ValidationResult }
  | { kind: "error"; error: { code: PublishErrorCode; message: string } }
> {
  if (!/\.zip$/i.test(source.fileName.trim())) {
    return {
      kind: "error",
      error: {
        code: "FILE_TYPE_INVALID",
        message: "只支持上传 ZIP 格式的技能包。",
      },
    };
  }

  if (source.buffer.byteLength === 0) {
    return {
      kind: "error",
      error: { code: "FILE_EMPTY", message: "上传的 ZIP 文件为空。" },
    };
  }

  const loaded = await loadSkillPackageFromZip(source.buffer, {
    limits: DEFAULT_SKILL_LIMITS,
  });

  if (!loaded.parsedSkill || !loaded.validation.valid) {
    return {
      kind: "validation-error",
      validation: loaded.validation,
    };
  }

  const validation = appendPublicationIssues(
    loaded.validation,
    loaded.parsedSkill,
    fields,
  );

  if (!validation.valid) {
    return { kind: "validation-error", validation };
  }

  const name = loaded.parsedSkill.manifest.name?.trim();
  const description = loaded.parsedSkill.manifest.description?.trim();
  const skillMd = loaded.package.skillMd;
  if (!name || !description || skillMd === undefined) {
    return {
      kind: "validation-error",
      validation: {
        ...validation,
        valid: false,
        issues: [
          ...validation.issues,
          issue("error", "PUBLICATION_DATA_MISSING", "发布所需的 Skill 内容不完整。"),
        ],
      },
    };
  }

  const category = resolveCategory(fields, loaded.parsedSkill);
  if (!category) {
    return {
      kind: "error",
      error: {
        code: "CATEGORY_REQUIRED",
        message: "发布 Skill 前必须选择一个已有分类。",
      },
    };
  }

  const slug = prepareSlug(loaded.parsedSkill, [], fields.slug);
  const version = prepareVersion(fields, loaded.parsedSkill, []);
  const storagePath = buildSkillPackageStoragePath(slug, version);

  return {
    kind: "ready",
    prepared: {
      packageInput: loaded.package,
      parsedSkill: loaded.parsedSkill,
      validation,
      name,
      description: fields.description?.trim() || description,
      displayName:
        fields.displayName?.trim() ||
        resolveDisplayName(loaded.parsedSkill, name),
      skillMd,
      slug,
      targetSlug: fields.targetSlug?.trim().toLowerCase() || undefined,
      version,
      category,
      tags: normalizeTags(fields.tags),
      packageBytes: source.buffer,
      storagePath,
      packageSize: source.buffer.byteLength,
      packageHash: sha256(source.buffer),
    },
  };
}

export async function publishSkillPackage(
  source: PublishSkillSource,
  fields: PublishSkillFields = {},
  dependencies: {
    transaction?: PublishTransactionRunner;
    preflight?: PublishPreflightRunner;
    storage?: SkillPackageStorage;
    owner?: PublishOwner;
  } = {},
): Promise<PublishSkillResult> {
  const prepared = await preparePublication(source, fields);
  if (prepared.kind !== "ready") {
    if (prepared.kind === "validation-error") {
      return prepared;
    }

    return prepared;
  }

  let prisma: PrismaClient | undefined;
  let transaction = dependencies.transaction;
  const needsPrisma = !transaction || !dependencies.preflight;
  if (needsPrisma) {
    try {
      prisma = getConfiguredPrisma();
    } catch {
      return {
        kind: "error",
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "当前未配置可用的 PostgreSQL 数据库，暂时无法发布 Skill。",
        },
      };
    }
  }

  try {
    const preflight =
      dependencies.preflight ??
      ((input: PublishPreflightInput) =>
        checkPublishPreflight(prisma as PublishPreflightClient, input));

    await preflight({
      slug: prepared.prepared.slug,
      version: prepared.prepared.version,
      category: prepared.prepared.category,
      targetSlug: prepared.prepared.targetSlug,
      owner: dependencies.owner,
    });
  } catch (error) {
    return databaseError(error);
  }

  let storage = dependencies.storage;
  if (!storage) {
    try {
      storage = getConfiguredSkillPackageStorage();
    } catch (error) {
      return storageError(error);
    }
  }

  try {
    if (await storage.exists(prepared.prepared.storagePath)) {
      return {
        kind: "error",
        error: {
          code: "STORAGE_PATH_EXISTS",
          message: "该版本的 Skill ZIP 已存在，不能覆盖已有文件。",
        },
      };
    }

    await storage.upload(prepared.prepared.storagePath, prepared.prepared.packageBytes);
  } catch (error) {
    return storageError(error);
  }

  if (!transaction) {
    transaction = <T>(callback: (tx: PublishTransactionClient) => Promise<T>) =>
      (prisma as PrismaClient).$transaction((tx) => callback(tx));
  }

  try {
    const result = await transaction((tx) =>
      persistPublication(tx, prepared.prepared, dependencies.owner),
    );

    return {
      kind: "success",
      skill: {
        id: result.skillId,
        slug: prepared.prepared.slug,
        version: result.version,
        url: `/skills/${prepared.prepared.slug}`,
      },
      validation: prepared.prepared.validation,
      warnings: prepared.prepared.validation.issues.filter(
        (item) => item.severity === "warning",
      ),
    };
  } catch (error) {
    try {
      await storage.remove(prepared.prepared.storagePath);
    } catch {
      return {
        kind: "error",
        error: {
          code: "PUBLISH_COMPENSATION_FAILED",
          message:
            "数据库事务失败，且未能清理已上传的技能包对象，请人工检查 Storage。",
        },
      };
    }

    return databaseError(error);
  }
}

export { normalizeTags, tagSlug };
