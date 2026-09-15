import type { SkillLimits } from "./types";

export const SKILL_MD_FILENAME = "SKILL.md";

export const MAX_PACKAGE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_COUNT = 100;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_DIRECTORY_DEPTH = 8;
export const MAX_COMPRESSION_RATIO = 1000;
export const MIN_COMPRESSION_CHECK_SIZE_BYTES = 1024 * 1024;

export const DEFAULT_SKILL_LIMITS: SkillLimits = {
  maxPackageSizeBytes: MAX_PACKAGE_SIZE_BYTES,
  maxFileCount: MAX_FILE_COUNT,
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  maxDirectoryDepth: MAX_DIRECTORY_DEPTH,
};

export const SCRIPT_FILE_EXTENSIONS = [
  ".bash",
  ".bat",
  ".cmd",
  ".cjs",
  ".fish",
  ".js",
  ".mjs",
  ".pl",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".ts",
  ".zsh",
] as const;

export const DANGEROUS_FILE_EXTENSIONS = [
  ".bin",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".hta",
  ".jar",
  ".msi",
  ".scr",
  ".so",
  ".vbe",
  ".vbs",
] as const;
