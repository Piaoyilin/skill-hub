export type SkillMetadataValue =
  | string
  | number
  | boolean
  | null
  | SkillMetadataValue[]
  | { [key: string]: SkillMetadataValue };

export type SkillMetadata = Record<string, SkillMetadataValue>;

/**
 * The parser keeps required fields optional so it can return a structured
 * result for invalid documents. The validator enforces required fields.
 */
export interface SkillManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  compatibility?: string;
  metadata?: SkillMetadata;
  allowedTools?: string[];
}

export type SkillFileType = "file" | "directory";

export interface SkillFile {
  path: string;
  type?: SkillFileType;
  sizeBytes?: number;
  isSymlink?: boolean;
  /** Content is populated by adapters only after metadata checks pass. */
  content?: Uint8Array;
}

export interface ParsedSkill {
  manifest: SkillManifest;
  body: string;
  rawSkillMd: string;
  /**
   * Retaining the original mapping lets the validator report precise type
   * errors without reparsing the document.
   */
  rawFrontmatter: Record<string, unknown>;
  files: SkillFile[];
  scripts: SkillFile[];
  references: SkillFile[];
  assets: SkillFile[];
}

export interface SkillPackageInput {
  /** Raw SKILL.md contents. No file system access is performed. */
  skillMd?: string;
  /** Package-relative path where the supplied SKILL.md was found. */
  skillMdPath?: string;
  /** Optional package root path supplied by an importer for static checking. */
  rootPath?: string;
  /** Package-relative entries, including files and optional directory entries. */
  files?: SkillFile[];
  /** Optional archive size when it cannot be derived from file entries. */
  totalSizeBytes?: number;
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  parsedSkill?: ParsedSkill;
}

export interface SkillLimits {
  maxPackageSizeBytes: number;
  maxFileCount: number;
  maxFileSizeBytes: number;
  maxDirectoryDepth: number;
}
