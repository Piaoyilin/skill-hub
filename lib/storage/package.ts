import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

export const SKILL_PACKAGE_BUCKET = "skill-packages";

const SAFE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STORAGE_PATH_PATTERN =
  /^skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([^/]+)\/skill\.zip$/;

export type SkillPackageStorageErrorCode =
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_PATH_INVALID"
  | "STORAGE_PATH_EXISTS"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_OBJECT_NOT_FOUND"
  | "STORAGE_DOWNLOAD_FAILED"
  | "STORAGE_DELETE_FAILED";

export class SkillPackageStorageError extends Error {
  readonly code: SkillPackageStorageErrorCode;

  constructor(code: SkillPackageStorageErrorCode, message: string) {
    super(message);
    this.name = "SkillPackageStorageError";
    this.code = code;
  }
}

export type SkillPackageStorage = {
  exists(path: string): Promise<boolean>;
  upload(path: string, content: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
};

export function isSafeSkillPackageSlug(value: string) {
  return SAFE_SLUG_PATTERN.test(value);
}

export function isSafeSkillPackageVersion(value: string) {
  return SAFE_VERSION_PATTERN.test(value);
}

function assertSafeStoragePath(path: string) {
  const match = STORAGE_PATH_PATTERN.exec(path);
  if (
    !match ||
    !SAFE_SLUG_PATTERN.test(match[1] ?? "") ||
    !SAFE_VERSION_PATTERN.test(match[2] ?? "")
  ) {
    throw new SkillPackageStorageError(
      "STORAGE_PATH_INVALID",
      "技能包存储路径无效。",
    );
  }
}

export function buildSkillPackageStoragePath(slug: string, version: string) {
  if (!SAFE_SLUG_PATTERN.test(slug) || !SAFE_VERSION_PATTERN.test(version)) {
    throw new SkillPackageStorageError(
      "STORAGE_PATH_INVALID",
      "无法为当前 Skill 生成安全的存储路径。",
    );
  }

  return `skills/${slug}/${version}/skill.zip`;
}

export function isSkillPackageStoragePath(
  path: string,
  slug?: string,
  version?: string,
) {
  try {
    assertSafeStoragePath(path);
  } catch {
    return false;
  }

  if (slug !== undefined && version !== undefined) {
    return path === buildSkillPackageStoragePath(slug, version);
  }

  return true;
}

function storageError(
  code: SkillPackageStorageErrorCode,
  message: string,
  detail?: unknown,
) {
  const suffix =
    detail && typeof detail === "object" && "message" in detail
      ? `：${String(detail.message)}`
      : "";
  return new SkillPackageStorageError(code, `${message}${suffix}`);
}

function getStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new SkillPackageStorageError(
      "STORAGE_NOT_CONFIGURED",
      "未配置 Supabase Storage 服务端环境变量。",
    );
  }

  return { url, serviceRoleKey };
}

export function getConfiguredSkillPackageStorage(): SkillPackageStorage {
  const { url, serviceRoleKey } = getStorageConfig();
  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const bucket = client.storage.from(SKILL_PACKAGE_BUCKET);

  return {
    async exists(path) {
      assertSafeStoragePath(path);
      const parts = path.split("/");
      const fileName = parts.pop();
      const folder = parts.join("/");
      if (!fileName) {
        throw new SkillPackageStorageError(
          "STORAGE_PATH_INVALID",
          "技能包存储路径无效。",
        );
      }

      const { data, error } = await bucket.list(folder, {
        limit: 100,
        search: fileName,
      });

      if (error) {
        throw storageError(
          "STORAGE_DOWNLOAD_FAILED",
          "无法检查技能包存储对象。",
          error,
        );
      }

      return (data ?? []).some((entry) => entry.name === fileName);
    },

    async upload(path, content) {
      assertSafeStoragePath(path);
      const { error } = await bucket.upload(path, Buffer.from(content), {
        contentType: "application/zip",
        cacheControl: "3600",
        upsert: false,
      });

      if (!error) return;

      const message = error.message.toLowerCase();
      if (
        error.statusCode === "409" ||
        message.includes("already exists") ||
        message.includes("duplicate")
      ) {
        throw storageError(
          "STORAGE_PATH_EXISTS",
          "技能包存储路径已经存在，不能覆盖已有文件。",
          error,
        );
      }

      throw storageError(
        "STORAGE_UPLOAD_FAILED",
        "技能包上传到 Supabase Storage 失败。",
        error,
      );
    },

    async remove(path) {
      assertSafeStoragePath(path);
      const { error } = await bucket.remove([path]);
      if (error) {
        throw storageError(
          "STORAGE_DELETE_FAILED",
          "无法清理未完成发布的技能包对象。",
          error,
        );
      }
    },

    async download(path) {
      assertSafeStoragePath(path);
      const { data, error } = await bucket.download(path);
      if (error || !data) {
        if (
          error?.statusCode === "404" ||
          error?.message?.toLowerCase().includes("not found")
        ) {
          throw storageError(
            "STORAGE_OBJECT_NOT_FOUND",
            "技能包存储对象不存在。",
            error,
          );
        }

        throw storageError(
          "STORAGE_DOWNLOAD_FAILED",
          "无法读取技能包存储对象。",
          error,
        );
      }

      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
