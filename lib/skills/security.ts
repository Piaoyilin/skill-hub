import {
  DANGEROUS_FILE_EXTENSIONS,
  DEFAULT_SKILL_LIMITS,
  SCRIPT_FILE_EXTENSIONS,
} from "./constants";
import type {
  SkillFile,
  SkillFileType,
  SkillLimits,
  ValidationIssue,
} from "./types";

const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:/;
const INVALID_FILENAME_CHARACTER_PATTERN = /[\u0000-\u001f<>:"|?*]/;
const WINDOWS_RESERVED_NAME_PATTERN =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: string,
): ValidationIssue {
  return { severity, code, message, ...(path ? { path } : {}) };
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function getPathParts(path: string) {
  return normalizePath(path).split("/");
}

function getExtension(path: string) {
  const fileName = getPathParts(path).at(-1)?.toLowerCase() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex) : "";
}

export function isPathTraversal(path: string) {
  return getPathParts(path).some((part) => part === "..");
}

export function isAbsolutePath(path: string) {
  const normalized = normalizePath(path);
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(path)
  );
}

export function isScriptPath(path: string) {
  const normalized = normalizePath(path).toLowerCase();
  const parts = normalized.split("/");
  return (
    parts.includes("scripts") ||
    SCRIPT_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  );
}

export function isDangerousPath(path: string) {
  return DANGEROUS_FILE_EXTENSIONS.includes(
    getExtension(path) as (typeof DANGEROUS_FILE_EXTENSIONS)[number],
  );
}

export function inspectPath(
  path: string,
  limits: SkillLimits = DEFAULT_SKILL_LIMITS,
  type?: SkillFileType,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (path === "." && type === "directory") {
    return issues;
  }

  const normalized = normalizePath(path);
  const hasTrailingSeparator = /[\\/]$/.test(path);
  const pathWithoutTrailingSeparator = normalized.replace(/\/+$/, "");
  const parts = pathWithoutTrailingSeparator.split("/");
  const fileName = parts.at(-1) ?? "";
  const visibleParts = parts.filter((part) => part !== "");

  if (!path || path.includes("\0") || !pathWithoutTrailingSeparator) {
    issues.push(
      issue("error", "INVALID_PATH", "文件路径不能为空且不能包含非法字符。", path),
    );
    return issues;
  }

  if (isPathTraversal(path)) {
    issues.push(
      issue(
        "error",
        "PATH_TRAVERSAL",
        "检测到可能的路径穿越：路径不能包含 ..。",
        path,
      ),
    );
  }

  if (isAbsolutePath(path)) {
    issues.push(
      issue("error", "ABSOLUTE_PATH", "技能包中的路径必须是相对路径。", path),
    );
  }

  if (WINDOWS_DRIVE_PATH_PATTERN.test(path)) {
    issues.push(
      issue("error", "WINDOWS_DRIVE_PATH", "技能包路径不能包含 Windows 盘符。", path),
    );
  }

  if (parts.some((part) => part === "")) {
    issues.push(
      issue("error", "INVALID_PATH", "文件路径不能包含空的目录片段。", path),
    );
  }

  if (hasTrailingSeparator && type !== "directory") {
    issues.push(
      issue("error", "INVALID_PATH", "文件路径不能以目录分隔符结尾。", path),
    );
  }

  if (
    fileName === "." ||
    fileName === ".." ||
    INVALID_FILENAME_CHARACTER_PATTERN.test(fileName) ||
    WINDOWS_RESERVED_NAME_PATTERN.test(fileName)
  ) {
    issues.push(
      issue(
        "error",
        "INVALID_FILENAME",
        "文件名包含当前环境不支持的字符或保留名称。",
        path,
      ),
    );
  }

  const directoryDepth = Math.max(0, visibleParts.length - 1);
  if (directoryDepth > limits.maxDirectoryDepth) {
    issues.push(
      issue(
        "error",
        "DIRECTORY_DEPTH_LIMIT",
        `目录深度不能超过 ${limits.maxDirectoryDepth} 层。`,
        path,
      ),
    );
  }

  if (
    visibleParts.some(
      (part) => part.startsWith(".") && part !== "." && part !== "..",
    )
  ) {
    issues.push(
      issue(
        "warning",
        "HIDDEN_FILE",
        "检测到隐藏文件或隐藏目录，请确认其内容和用途。",
        path,
      ),
    );
  }

  if (isScriptPath(path)) {
    issues.push(
      issue(
        "warning",
        "SCRIPT_FILE_PRESENT",
        "技能包包含脚本文件或 scripts 目录；Skill Hub 不会执行这些脚本。",
        path,
      ),
    );
  }

  if (isDangerousPath(path)) {
    issues.push(
      issue(
        "warning",
        "DANGEROUS_EXTENSION",
        "检测到可能具有执行风险的文件扩展名，请人工审核。",
        path,
      ),
    );
  }

  return issues;
}

export function inspectSkillFiles(
  files: readonly SkillFile[],
  limits: SkillLimits = DEFAULT_SKILL_LIMITS,
  totalSizeBytes?: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const seenPaths = new Set<string>();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    if (seenPaths.has(normalized)) {
      issues.push(
        issue(
          "error",
          "DUPLICATE_PATH",
          "技能包中存在重复的文件路径。",
          file.path,
        ),
      );
    }
    seenPaths.add(normalized);
  }

  if (files.length > limits.maxFileCount) {
    issues.push(
      issue(
        "error",
        "FILE_COUNT_LIMIT",
        `技能包文件数量不能超过 ${limits.maxFileCount} 个。`,
      ),
    );
  }

  let knownTotalSize = 0;
  for (const file of files) {
    issues.push(...inspectPath(file.path, limits, file.type));

    if (file.isSymlink) {
      issues.push(
        issue(
          "warning",
          "SYMLINK_RISK",
          "检测到符号链接风险；导入前必须拒绝或安全地解引用该条目。",
          file.path,
        ),
      );
    }

    if (file.sizeBytes !== undefined) {
      if (!Number.isFinite(file.sizeBytes) || file.sizeBytes < 0) {
        issues.push(
          issue(
            "error",
            "INVALID_FILE_SIZE",
            "文件大小必须是非负的有限数字。",
            file.path,
          ),
        );
      } else {
        knownTotalSize += file.sizeBytes;
        if (
          file.type !== "directory" &&
          file.sizeBytes > limits.maxFileSizeBytes
        ) {
          issues.push(
            issue(
              "error",
              "FILE_SIZE_LIMIT",
              `单个文件不能超过 ${limits.maxFileSizeBytes} 字节。`,
              file.path,
            ),
          );
        }
      }
    }
  }

  const packageSize = totalSizeBytes ?? knownTotalSize;
  if (!Number.isFinite(packageSize) || packageSize < 0) {
    issues.push(
      issue("error", "INVALID_PACKAGE_SIZE", "技能包大小必须是非负的有限数字。"),
    );
  } else if (packageSize > limits.maxPackageSizeBytes) {
    issues.push(
      issue(
        "error",
        "PACKAGE_SIZE_LIMIT",
        `技能包总大小不能超过 ${limits.maxPackageSizeBytes} 字节。`,
      ),
    );
  }

  return issues;
}
