import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import * as yauzl from "yauzl";
import {
  DEFAULT_SKILL_LIMITS,
  MAX_COMPRESSION_RATIO,
  MIN_COMPRESSION_CHECK_SIZE_BYTES,
  SKILL_MD_FILENAME,
} from "./constants";
import { inspectPath } from "./security";
import type {
  ParsedSkill,
  SkillFile,
  SkillLimits,
  SkillPackageInput,
  ValidationIssue,
  ValidationResult,
} from "./types";
import { validateSkillPackage } from "./validator";

export type SkillZipLoadOptions = {
  limits?: SkillLimits;
};

export type SkillZipLoadResult = {
  package: SkillPackageInput;
  parsedSkill?: ParsedSkill;
  validation: ValidationResult;
};

type ZipEntryRecord = {
  entry: yauzl.Entry;
  path: string;
  type: "file" | "directory";
  isSymlink: boolean;
  pathIssues: ValidationIssue[];
  file: SkillFile;
  unsupported: boolean;
  encrypted: boolean;
};

type AdapterIssueCode =
  | "ZIP_INVALID"
  | "ZIP_SIZE_LIMIT"
  | "ZIP_ENTRY_INVALID"
  | "ZIP_ENTRY_SIZE_INVALID"
  | "ZIP_COMPRESSION_UNSUPPORTED"
  | "ZIP_ENCRYPTED"
  | "ZIP_COMPRESSION_RATIO_HIGH"
  | "ZIP_ENTRY_READ_FAILED"
  | "ZIP_CONTENT_LIMIT"
  | "SYMLINK_REJECTED"
  | "SKILL_MD_MULTIPLE"
  | "SKILL_MD_NOT_AT_ROOT";

class ZipAdapterError extends Error {
  readonly code: AdapterIssueCode;
  readonly path?: string;

  constructor(code: AdapterIssueCode, message: string, path?: string) {
    super(message);
    this.name = "ZipAdapterError";
    this.code = code;
    this.path = path;
  }
}

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: string,
): ValidationIssue {
  return { severity, code, message, ...(path ? { path } : {}) };
}

function normalizeEntryPath(path: string, type: "file" | "directory") {
  let normalized = path.replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  if (!normalized) {
    return type === "directory" ? "." : normalized;
  }

  return type === "directory" ? normalized.replace(/\/+$/, "") || "." : normalized;
}

function decodeEntryPath(entry: yauzl.Entry) {
  return yauzl.getFileNameLowLevel(
    entry.generalPurposeBitFlag,
    entry.fileNameRaw,
    entry.extraFields,
    false,
  );
}

function getUnixMode(entry: yauzl.Entry) {
  return (entry.externalFileAttributes >>> 16) & 0xffff;
}

function isSymlinkEntry(entry: yauzl.Entry) {
  return (getUnixMode(entry) & 0xf000) === 0xa000;
}

function isDirectoryEntry(entry: yauzl.Entry, decodedPath: string) {
  const hostSystem = entry.versionMadeBy >>> 8;
  const unixType = getUnixMode(entry) & 0xf000;
  const dosDirectory = hostSystem === 0 && (entry.externalFileAttributes & 0x10) !== 0;

  return (
    decodedPath.endsWith("/") ||
    unixType === 0x4000 ||
    dosDirectory
  );
}

function hasError(issues: readonly ValidationIssue[]) {
  return issues.some((item) => item.severity === "error");
}

function getTopLevel(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split("/")[0] ?? "";
}

function findSingleRootPrefix(records: readonly ZipEntryRecord[]) {
  const safePaths = records
    .filter((record) => !hasError(record.pathIssues) && record.path !== ".")
    .map((record) => record.path);

  const topLevels = new Set(safePaths.map(getTopLevel).filter(Boolean));
  if (topLevels.size !== 1) return undefined;

  const prefix = [...topLevels][0];
  const prefixRecord = records.find((record) => record.path === prefix);
  const hasNestedEntry = safePaths.some((path) => path.startsWith(`${prefix}/`));

  if (prefixRecord?.type === "file" || !hasNestedEntry) {
    return undefined;
  }

  return prefix;
}

function stripRootPrefix(path: string, rootPrefix?: string) {
  if (!rootPrefix) return path;
  if (path === rootPrefix) return ".";
  if (path.startsWith(`${rootPrefix}/`)) {
    return path.slice(rootPrefix.length + 1) || ".";
  }
  return path;
}

function createEmptyPackage(totalSizeBytes?: number): SkillPackageInput {
  return {
    files: [],
    ...(totalSizeBytes === undefined ? {} : { totalSizeBytes }),
  };
}

function finalizeResult(
  packageInput: SkillPackageInput,
  adapterIssues: readonly ValidationIssue[],
  limits: SkillLimits,
): SkillZipLoadResult {
  const validation = validateSkillPackage(packageInput, { limits });
  const issues = [...adapterIssues, ...validation.issues];
  const result: ValidationResult = {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    parsedSkill: validation.parsedSkill,
  };

  return {
    package: packageInput,
    parsedSkill: result.parsedSkill,
    validation: result,
  };
}

async function readEntryContent(
  stream: Readable,
  path: string,
  limits: SkillLimits,
  budget: { actualExtractedBytes: number },
) {
  const chunks: Buffer[] = [];
  let fileBytes = 0;

  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      const bytes = Buffer.from(chunk);
      fileBytes += bytes.length;
      budget.actualExtractedBytes += bytes.length;

      if (fileBytes > limits.maxFileSizeBytes) {
        stream.destroy();
        throw new ZipAdapterError(
          "ZIP_CONTENT_LIMIT",
          `解压后的单个文件不能超过 ${limits.maxFileSizeBytes} 字节。`,
          path,
        );
      }

      if (budget.actualExtractedBytes > limits.maxPackageSizeBytes) {
        stream.destroy();
        throw new ZipAdapterError(
          "ZIP_CONTENT_LIMIT",
          `解压后的技能包总大小不能超过 ${limits.maxPackageSizeBytes} 字节。`,
          path,
        );
      }

      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ZipAdapterError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new ZipAdapterError(
      "ZIP_ENTRY_READ_FAILED",
      `读取 ZIP 条目失败：${detail}`,
      path,
    );
  }

  return Buffer.concat(chunks, fileBytes);
}

async function openZip(buffer: Buffer) {
  return yauzl.fromBufferPromise(buffer, {
    decodeStrings: false,
    lazyEntries: true,
    strictFileNames: false,
    validateEntrySizes: true,
  });
}

async function collectEntries(
  zipfile: yauzl.ZipFile,
  limits: SkillLimits,
  adapterIssues: ValidationIssue[],
) {
  const records: ZipEntryRecord[] = [];
  let declaredTotalSize = 0;

  for await (const entry of zipfile.eachEntry()) {
    let decodedPath: string;
    try {
      decodedPath = decodeEntryPath(entry);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      adapterIssues.push(
        issue("error", "ZIP_ENTRY_INVALID", `ZIP 条目文件名无法解析：${detail}`),
      );
      continue;
    }

    const type = isDirectoryEntry(entry, decodedPath) ? "directory" : "file";
    const path = normalizeEntryPath(decodedPath, type);
    const pathIssues = inspectPath(path, limits, type);
    const symlink = isSymlinkEntry(entry);
    const encrypted = entry.isEncrypted();
    const unsupported = entry.compressionMethod !== 0 && entry.compressionMethod !== 8;

    adapterIssues.push(...pathIssues);

    if (symlink) {
      adapterIssues.push(
        issue(
          "error",
          "SYMLINK_REJECTED",
          "ZIP 中的符号链接条目被拒绝，Skill Hub 不会解引用或写入该条目。",
          path,
        ),
      );
    }

    if (encrypted) {
      adapterIssues.push(
        issue(
          "error",
          "ZIP_ENCRYPTED",
          "不支持读取加密的 ZIP 条目。",
          path,
        ),
      );
    }

    if (unsupported) {
      adapterIssues.push(
        issue(
          "error",
          "ZIP_COMPRESSION_UNSUPPORTED",
          `不支持 ZIP 压缩方法 ${entry.compressionMethod}。`,
          path,
        ),
      );
    }

    const size = entry.uncompressedSize;
    if (!Number.isFinite(size) || size < 0 || !Number.isSafeInteger(size)) {
      adapterIssues.push(
        issue(
          "error",
          "ZIP_ENTRY_SIZE_INVALID",
          "ZIP 条目的解压大小不是可安全处理的非负整数。",
          path,
        ),
      );
    } else {
      declaredTotalSize = Math.min(Number.MAX_SAFE_INTEGER, declaredTotalSize + size);

      if (size >= MIN_COMPRESSION_CHECK_SIZE_BYTES && entry.compressedSize > 0) {
        const ratio = size / entry.compressedSize;
        if (ratio > MAX_COMPRESSION_RATIO) {
          adapterIssues.push(
            issue(
              "warning",
              "ZIP_COMPRESSION_RATIO_HIGH",
              `ZIP 条目的压缩比约为 ${ratio.toFixed(0)}，高于建议阈值，请人工审核。`,
              path,
            ),
          );
        }
      }
    }

    records.push({
      entry,
      path,
      type,
      isSymlink: symlink,
      pathIssues,
      unsupported,
      encrypted,
      file: {
        path,
        type,
        sizeBytes: Number.isFinite(size) && size >= 0 ? size : undefined,
        ...(symlink ? { isSymlink: true } : {}),
      },
    });
  }

  if (records.length > limits.maxFileCount) {
    adapterIssues.push(
      issue(
        "error",
        "FILE_COUNT_LIMIT",
        `技能包文件数量不能超过 ${limits.maxFileCount} 个。`,
      ),
    );
  }

  return { records, declaredTotalSize };
}

/**
 * Loads a ZIP package entirely in memory. It never writes entries to disk and
 * never executes scripts. Entry metadata is checked before any file content
 * is read, and a second budget guards the actual decompressed byte count.
 */
export async function loadSkillPackageFromZip(
  input: Buffer | Uint8Array,
  options: SkillZipLoadOptions = {},
): Promise<SkillZipLoadResult> {
  const limits = options.limits ?? DEFAULT_SKILL_LIMITS;
  const buffer = Buffer.from(input);

  if (buffer.length > limits.maxPackageSizeBytes) {
    return finalizeResult(
      createEmptyPackage(buffer.length),
      [
        issue(
          "error",
          "ZIP_SIZE_LIMIT",
          `ZIP 文件大小不能超过 ${limits.maxPackageSizeBytes} 字节。`,
        ),
      ],
      limits,
    );
  }

  let zipfile: yauzl.ZipFile | undefined;
  const adapterIssues: ValidationIssue[] = [];

  try {
    zipfile = await openZip(buffer);
    const { records, declaredTotalSize } = await collectEntries(
      zipfile,
      limits,
      adapterIssues,
    );

    const skillEntries = records.filter(
      (record) =>
        record.type === "file" &&
        record.path.split("/").at(-1) === SKILL_MD_FILENAME,
    );

    if (skillEntries.length > 1) {
      adapterIssues.push(
        issue(
          "error",
          "SKILL_MD_MULTIPLE",
          `ZIP 中存在多个 ${SKILL_MD_FILENAME}，无法确定唯一技能入口。`,
        ),
      );
    }

    const rootPrefix = findSingleRootPrefix(records);
    const packageFiles: SkillFile[] = [];
    const transformed = records
      .map((record) => ({
        record,
        path: stripRootPrefix(record.path, rootPrefix),
      }))
      .filter(({ path }) => path !== "." || !rootPrefix);

    const normalizedSkillEntries = skillEntries.map((record) => ({
      record,
      path: stripRootPrefix(record.path, rootPrefix),
    }));

    if (skillEntries.length === 1) {
      const skillPath = normalizedSkillEntries[0]?.path;
      if (skillPath !== SKILL_MD_FILENAME) {
        adapterIssues.push(
          issue(
            "error",
            "SKILL_MD_NOT_AT_ROOT",
            `${SKILL_MD_FILENAME} 必须位于 Skill 根目录。`,
            skillPath,
          ),
        );
      }
    }

    const packageInput: SkillPackageInput = {
      files: packageFiles,
      totalSizeBytes: Math.max(declaredTotalSize, 0),
      ...(rootPrefix ? { rootPath: "." } : {}),
    };

    if (skillEntries.length === 1) {
      packageInput.skillMdPath = normalizedSkillEntries[0]?.path;
    }

    const budget = { actualExtractedBytes: 0 };
    let stoppedReading = false;

    for (const item of transformed) {
      const { record, path } = item;
      if (!path || (rootPrefix && path === ".")) continue;

      const file = { ...record.file, path };
      packageFiles.push(file);

      const shouldRead =
        record.type === "file" &&
        !record.isSymlink &&
        !record.encrypted &&
        !record.unsupported &&
        !hasError(record.pathIssues) &&
        file.sizeBytes !== undefined &&
        file.sizeBytes <= limits.maxFileSizeBytes;

      if (!shouldRead) continue;

      try {
        const content = await readEntryContent(
          await zipfile.openReadStreamPromise(record.entry),
          path,
          limits,
          budget,
        );
        file.content = content;

        if (
          skillEntries.length === 1 &&
          normalizedSkillEntries[0]?.record === record
        ) {
          packageInput.skillMd = content.toString("utf8");
        }
      } catch (error) {
        const zipError =
          error instanceof ZipAdapterError
            ? error
            : new ZipAdapterError(
                "ZIP_ENTRY_READ_FAILED",
                error instanceof Error ? error.message : String(error),
                path,
              );
        adapterIssues.push(issue("error", zipError.code, zipError.message, zipError.path));
        stoppedReading = true;
        break;
      }
    }

    if (stoppedReading && budget.actualExtractedBytes > limits.maxPackageSizeBytes) {
      adapterIssues.push(
        issue(
          "error",
          "PACKAGE_SIZE_LIMIT",
          `解压后的技能包总大小不能超过 ${limits.maxPackageSizeBytes} 字节。`,
        ),
      );
    }

    packageInput.totalSizeBytes = Math.max(
      packageInput.totalSizeBytes ?? 0,
      budget.actualExtractedBytes,
    );

    const result = finalizeResult(packageInput, adapterIssues, limits);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return finalizeResult(
      createEmptyPackage(buffer.length),
      [issue("error", "ZIP_INVALID", `ZIP 文件无法读取：${detail}`)],
      limits,
    );
  } finally {
    zipfile?.close();
  }
}

export const parseSkillZip = loadSkillPackageFromZip;
