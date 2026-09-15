import { DEFAULT_SKILL_LIMITS, SKILL_MD_FILENAME } from "./constants";
import { parseSkillMd, SkillParseError } from "./parser";
import { inspectPath, inspectSkillFiles, isScriptPath } from "./security";
import type {
  ParsedSkill,
  SkillFile,
  SkillLimits,
  SkillPackageInput,
  ValidationIssue,
  ValidationResult,
} from "./types";

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function addRequiredFieldIssue(
  issues: ValidationIssue[],
  frontmatter: Record<string, unknown>,
  field: "name" | "description",
) {
  if (!hasOwn(frontmatter, field)) {
    issues.push({
      severity: "error",
      code: `${field.toUpperCase()}_MISSING`,
      message: `SKILL.md 缺少必填字段 ${field}。`,
      path: field,
    });
    return;
  }

  const value = frontmatter[field];
  if (typeof value !== "string") {
    issues.push({
      severity: "error",
      code: `${field.toUpperCase()}_TYPE_INVALID`,
      message: `${field} 必须是字符串。`,
      path: field,
    });
    return;
  }

  if (!value.trim()) {
    issues.push({
      severity: "error",
      code: `${field.toUpperCase()}_EMPTY`,
      message: `${field} 不能为空。`,
      path: field,
    });
  }
}

function validateOptionalManifestFields(
  frontmatter: Record<string, unknown>,
  issues: ValidationIssue[],
) {
  for (const field of [
    "version",
    "author",
    "license",
    "compatibility",
  ] as const) {
    if (hasOwn(frontmatter, field) && typeof frontmatter[field] !== "string") {
      issues.push({
        severity: "error",
        code: `${field.toUpperCase()}_TYPE_INVALID`,
        message: `${field} 必须是字符串。`,
        path: field,
      });
    }
  }

  if (hasOwn(frontmatter, "metadata") && !isRecord(frontmatter.metadata)) {
    issues.push({
      severity: "error",
      code: "METADATA_TYPE_INVALID",
      message: "metadata 必须是对象。",
      path: "metadata",
    });
  }

  if (hasOwn(frontmatter, "allowed-tools")) {
    const allowedTools = frontmatter["allowed-tools"];
    const valid = typeof allowedTools === "string" || isStringArray(allowedTools);
    if (!valid) {
      issues.push({
        severity: "error",
        code: "ALLOWED_TOOLS_TYPE_INVALID",
        message: "allowed-tools 必须是字符串或字符串数组。",
        path: "allowed-tools",
      });
    }
  }
}

function categorizeFiles(files: SkillFile[]) {
  return {
    files,
    scripts: files.filter(
      (file) => file.type !== "directory" && isScriptPath(file.path),
    ),
    references: files.filter((file) =>
      file.path.split(/[\\/]/).includes("references"),
    ),
    assets: files.filter((file) => file.path.split(/[\\/]/).includes("assets")),
  };
}

function addSkillMdPathIssues(
  input: SkillPackageInput,
  files: readonly SkillFile[],
  limits: SkillLimits,
  issues: ValidationIssue[],
) {
  const skillMdPath = input.skillMdPath ?? SKILL_MD_FILENAME;
  if (skillMdPath !== SKILL_MD_FILENAME) {
    issues.push({
      severity: "error",
      code: "SKILL_MD_PATH_INVALID",
      message: `技能包必须在根目录包含 ${SKILL_MD_FILENAME}。`,
      path: skillMdPath,
    });
  }

  if (input.rootPath !== undefined) {
    issues.push(...inspectPath(input.rootPath, limits, "directory"));
  }

  if (input.files && !files.some((file) => file.path === SKILL_MD_FILENAME)) {
    issues.push({
      severity: "error",
      code: "SKILL_MD_MISSING",
      message: `技能包中缺少 ${SKILL_MD_FILENAME}。`,
      path: SKILL_MD_FILENAME,
    });
  }
}

function enrichParsedSkill(parsedSkill: ParsedSkill, files: SkillFile[]) {
  return {
    ...parsedSkill,
    ...categorizeFiles(files),
  };
}

export function validateSkillPackage(
  input: SkillPackageInput,
  options: { limits?: SkillLimits } = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const limits = options.limits ?? DEFAULT_SKILL_LIMITS;
  const files =
    input.files ??
    (input.skillMd !== undefined
      ? [{ path: SKILL_MD_FILENAME, type: "file" as const }]
      : []);

  addSkillMdPathIssues(input, files, limits, issues);
  issues.push(...inspectSkillFiles(files, limits, input.totalSizeBytes));

  if (input.skillMd === undefined) {
    issues.push({
      severity: "error",
      code: "SKILL_MD_CONTENT_MISSING",
      message: `无法读取 ${SKILL_MD_FILENAME} 内容。`,
      path: SKILL_MD_FILENAME,
    });
  } else {
    try {
      const parsedSkill = parseSkillMd(input.skillMd);
      addRequiredFieldIssue(issues, parsedSkill.rawFrontmatter, "name");
      addRequiredFieldIssue(issues, parsedSkill.rawFrontmatter, "description");
      validateOptionalManifestFields(parsedSkill.rawFrontmatter, issues);

      return {
        valid: !issues.some((item) => item.severity === "error"),
        issues,
        parsedSkill: enrichParsedSkill(parsedSkill, files),
      };
    } catch (error) {
      if (error instanceof SkillParseError) {
        issues.push({
          severity: "error",
          code: error.code,
          message: error.message,
        });
      } else {
        issues.push({
          severity: "error",
          code: "SKILL_MD_PARSE_FAILED",
          message: "SKILL.md 解析失败。",
        });
      }
    }
  }

  return {
    valid: false,
    issues,
  };
}

export function validateSkillFiles(
  files: readonly SkillFile[],
  options: { limits?: SkillLimits; totalSizeBytes?: number } = {},
): ValidationResult {
  const issues = inspectSkillFiles(
    files,
    options.limits ?? DEFAULT_SKILL_LIMITS,
    options.totalSizeBytes,
  );

  if (!files.some((file) => file.path === SKILL_MD_FILENAME)) {
    issues.push({
      severity: "error",
      code: "SKILL_MD_MISSING",
      message: `技能包中缺少 ${SKILL_MD_FILENAME}。`,
      path: SKILL_MD_FILENAME,
    });
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
  };
}
