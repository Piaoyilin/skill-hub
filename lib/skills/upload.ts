import { DEFAULT_SKILL_LIMITS } from "./constants";
import { isDangerousPath, isScriptPath } from "./security";
import type {
  ParsedSkill,
  SkillFile,
  SkillLimits,
  SkillManifest,
  ValidationIssue,
  ValidationResult,
} from "./types";
import { loadSkillPackageFromZip } from "./zip";

export type SkillUploadErrorCode =
  | "FILE_TYPE_INVALID"
  | "FILE_EMPTY"
  | "FILE_SIZE_LIMIT"
  | "ZIP_INVALID"
  | "VALIDATION_FAILED";

export interface SkillUploadError {
  code: SkillUploadErrorCode;
  message: string;
}

export interface SkillFilePreview {
  path: string;
  type: "file" | "directory";
  sizeBytes?: number;
  isSymlink?: boolean;
}

export type SkillManifestPreview = Pick<
  SkillManifest,
  | "name"
  | "description"
  | "version"
  | "author"
  | "license"
  | "compatibility"
  | "allowedTools"
>;

export interface SkillUploadPreview {
  skill: SkillManifestPreview | null;
  files: SkillFilePreview[];
  scripts: SkillFilePreview[];
  references: SkillFilePreview[];
  assets: SkillFilePreview[];
  validation: Pick<ValidationResult, "valid" | "issues">;
}

export type SkillUploadAnalysis =
  | {
      kind: "preview";
      preview: SkillUploadPreview;
    }
  | {
      kind: "error";
      error: SkillUploadError;
      preview?: SkillUploadPreview;
    };

export interface SkillUploadSource {
  buffer: Uint8Array;
  fileName: string;
}

function isZipFileName(fileName: string) {
  return /\.zip$/i.test(fileName.trim());
}

function toPreviewFile(file: SkillFile): SkillFilePreview {
  return {
    path: file.path,
    type: file.type === "directory" ? "directory" : "file",
    ...(file.sizeBytes === undefined ? {} : { sizeBytes: file.sizeBytes }),
    ...(file.isSymlink ? { isSymlink: true } : {}),
  };
}

function withoutParsedSkill(
  validation: ValidationResult,
): Pick<ValidationResult, "valid" | "issues"> {
  return {
    valid: validation.valid,
    issues: validation.issues,
  };
}

function categoryFiles(
  files: readonly SkillFile[],
  parsedSkill: ParsedSkill | undefined,
  category: "scripts" | "references" | "assets",
) {
  if (parsedSkill) {
    return parsedSkill[category].map(toPreviewFile);
  }

  if (category === "scripts") {
    return files
      .filter(
        (file) => file.type !== "directory" && isScriptPath(file.path),
      )
      .map(toPreviewFile);
  }

  return files
    .filter((file) => file.path.split(/[\\/]/).includes(category))
    .map(toPreviewFile);
}

function createPreview(
  files: readonly SkillFile[],
  parsedSkill: ParsedSkill | undefined,
  validation: ValidationResult,
): SkillUploadPreview {
  return {
    skill: parsedSkill
      ? {
          name: parsedSkill.manifest.name,
          description: parsedSkill.manifest.description,
          version: parsedSkill.manifest.version,
          author: parsedSkill.manifest.author,
          license: parsedSkill.manifest.license,
          compatibility: parsedSkill.manifest.compatibility,
          allowedTools: parsedSkill.manifest.allowedTools,
        }
      : null,
    files: files.map(toPreviewFile),
    scripts: categoryFiles(files, parsedSkill, "scripts"),
    references: categoryFiles(files, parsedSkill, "references"),
    assets: categoryFiles(files, parsedSkill, "assets"),
    validation: withoutParsedSkill(validation),
  };
}

function firstError(issues: readonly ValidationIssue[]) {
  return issues.find((item) => item.severity === "error");
}

function createValidationError(
  validation: ValidationResult,
  preview: SkillUploadPreview,
): SkillUploadAnalysis {
  const firstIssue = firstError(validation.issues);
  const isInvalidZip = firstIssue?.code === "ZIP_INVALID";

  return {
    kind: "error",
    error: {
      code: isInvalidZip ? "ZIP_INVALID" : "VALIDATION_FAILED",
      message: isInvalidZip
        ? "ZIP 文件无法解析，请确认文件没有损坏。"
        : "技能包未通过规范或安全检查，请根据检查结果修正后重试。",
    },
    preview,
  };
}

/**
 * Analyzes an uploaded ZIP in memory. This function deliberately returns
 * metadata only; file contents and raw SKILL.md text never leave the server.
 */
export async function analyzeSkillUpload(
  source: SkillUploadSource,
  options: { limits?: SkillLimits } = {},
): Promise<SkillUploadAnalysis> {
  const limits = options.limits ?? DEFAULT_SKILL_LIMITS;

  if (!isZipFileName(source.fileName)) {
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
      error: {
        code: "FILE_EMPTY",
        message: "上传的 ZIP 文件为空。",
      },
    };
  }

  if (source.buffer.byteLength > limits.maxPackageSizeBytes) {
    return {
      kind: "error",
      error: {
        code: "FILE_SIZE_LIMIT",
        message: `ZIP 文件大小不能超过 ${limits.maxPackageSizeBytes} 字节。`,
      },
    };
  }

  const loaded = await loadSkillPackageFromZip(source.buffer, { limits });
  const preview = createPreview(
    loaded.package.files ?? [],
    loaded.parsedSkill,
    loaded.validation,
  );

  if (!loaded.validation.valid) {
    return createValidationError(loaded.validation, preview);
  }

  return {
    kind: "preview",
    preview,
  };
}

export function containsDangerousFile(preview: SkillUploadPreview) {
  return preview.files.some((file) => isDangerousPath(file.path));
}
