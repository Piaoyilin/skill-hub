import { describe, expect, it } from "vitest";
import { parseSkillMd, SkillParseError } from "../../lib/skills";

describe("parseSkillMd", () => {
  it("parses a valid SKILL.md and extracts the Markdown body", () => {
    const raw = `---
name: React 性能检查
description: 检查 React 应用中的常见性能问题。
---

# 使用方式

先分析项目上下文。
`;

    const result = parseSkillMd(raw);

    expect(result.manifest.name).toBe("React 性能检查");
    expect(result.manifest.description).toBe(
      "检查 React 应用中的常见性能问题。",
    );
    expect(result.body).toContain("# 使用方式");
    expect(result.rawSkillMd).toBe(raw);
    expect(result.files).toEqual([]);
  });

  it("supports only the required fields", () => {
    const result = parseSkillMd(`---
name: 最小 Skill
description: 只有必填字段。
---
正文
`);

    expect(result.manifest).toEqual({
      name: "最小 Skill",
      description: "只有必填字段。",
      version: undefined,
      author: undefined,
      license: undefined,
      compatibility: undefined,
      metadata: undefined,
      allowedTools: undefined,
    });
  });

  it("parses optional metadata and allowed-tools", () => {
    const result = parseSkillMd(`---
name: 发布检查
description: 检查发布前的工程状态。
license: MIT
compatibility: Codex and Claude Code
metadata:
  category: release
  verified: true
allowed-tools: Read Write
---
正文
`);

    expect(result.manifest.license).toBe("MIT");
    expect(result.manifest.compatibility).toBe("Codex and Claude Code");
    expect(result.manifest.metadata).toEqual({
      category: "release",
      verified: true,
    });
    expect(result.manifest.allowedTools).toEqual(["Read", "Write"]);
  });

  it("accepts an allowed-tools string array", () => {
    const result = parseSkillMd(`---
name: 工具限制
description: 声明允许使用的工具。
allowed-tools:
  - Read
  - Write
---
`);

    expect(result.manifest.allowedTools).toEqual(["Read", "Write"]);
  });

  it("throws a clear error for invalid YAML", () => {
    const raw = `---
name: [未闭合
description: 测试
---
`;

    expect(() => parseSkillMd(raw)).toThrowError(SkillParseError);

    try {
      parseSkillMd(raw);
    } catch (error) {
      expect(error).toMatchObject({ code: "YAML_INVALID" });
    }
  });

  it("throws when Frontmatter is missing", () => {
    expect(() => parseSkillMd("# 没有 Frontmatter")).toThrowError(
      "SKILL.md 必须以 YAML Frontmatter 开始。",
    );
  });
});
