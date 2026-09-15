import { parseDocument } from "yaml";
import type { ParsedSkill, SkillManifest } from "./types";

const FRONTMATTER_PATTERN =
  /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export type SkillParseErrorCode =
  | "FRONTMATTER_MISSING"
  | "FRONTMATTER_NOT_OBJECT"
  | "YAML_INVALID";

export class SkillParseError extends Error {
  readonly code: SkillParseErrorCode;

  constructor(code: SkillParseErrorCode, message: string) {
    super(message);
    this.name = "SkillParseError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAllowedTools(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  return undefined;
}

function buildManifest(frontmatter: Record<string, unknown>): SkillManifest {
  return {
    name: typeof frontmatter.name === "string" ? frontmatter.name : undefined,
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : undefined,
    version:
      typeof frontmatter.version === "string" ? frontmatter.version : undefined,
    author:
      typeof frontmatter.author === "string" ? frontmatter.author : undefined,
    license:
      typeof frontmatter.license === "string" ? frontmatter.license : undefined,
    compatibility:
      typeof frontmatter.compatibility === "string"
        ? frontmatter.compatibility
        : undefined,
    metadata: isRecord(frontmatter.metadata)
      ? (frontmatter.metadata as SkillManifest["metadata"])
      : undefined,
    allowedTools: normalizeAllowedTools(frontmatter["allowed-tools"]),
  };
}

/**
 * Parses only SKILL.md data. It never reads from disk and never executes
 * scripts or Markdown code blocks.
 */
export function parseSkillMd(rawSkillMd: string): ParsedSkill {
  if (typeof rawSkillMd !== "string") {
    throw new SkillParseError("YAML_INVALID", "SKILL.md 内容必须是字符串。");
  }

  const match = FRONTMATTER_PATTERN.exec(rawSkillMd);
  if (!match) {
    throw new SkillParseError(
      "FRONTMATTER_MISSING",
      "SKILL.md 必须以 YAML Frontmatter 开始。",
    );
  }

  const frontmatterSource = match[1];
  let parsedFrontmatter: unknown;

  try {
    const document = parseDocument(frontmatterSource, {
      prettyErrors: true,
      uniqueKeys: true,
    });

    if (document.errors.length) {
      const detail = document.errors[0]?.message ?? "YAML 解析失败。";
      throw new SkillParseError(
        "YAML_INVALID",
        `SKILL.md 的 YAML Frontmatter 无法解析：${detail}`,
      );
    }

    parsedFrontmatter = document.toJS();
  } catch (error) {
    if (error instanceof SkillParseError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : "YAML 解析失败。";
    throw new SkillParseError(
      "YAML_INVALID",
      `SKILL.md 的 YAML Frontmatter 无法解析：${detail}`,
    );
  }

  if (!isRecord(parsedFrontmatter)) {
    throw new SkillParseError(
      "FRONTMATTER_NOT_OBJECT",
      "SKILL.md 的 Frontmatter 必须是对象。",
    );
  }

  return {
    manifest: buildManifest(parsedFrontmatter),
    body: rawSkillMd.slice(match[0].length),
    rawSkillMd,
    rawFrontmatter: parsedFrontmatter,
    files: [],
    scripts: [],
    references: [],
    assets: [],
  };
}
