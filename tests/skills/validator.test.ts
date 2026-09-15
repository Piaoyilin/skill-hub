import { describe, expect, it } from "vitest";
import { validateSkillPackage } from "../../lib/skills";

const validSkillMd = `---
name: 示例 Skill
description: 用于测试的合法 Skill。
---

# 说明
`;

function codes(result: ReturnType<typeof validateSkillPackage>) {
  return result.issues.map((item) => item.code);
}

describe("validateSkillPackage", () => {
  it("accepts a valid Skill package", () => {
    const result = validateSkillPackage({ skillMd: validSkillMd });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.parsedSkill?.manifest.name).toBe("示例 Skill");
  });

  it("reports a missing SKILL.md", () => {
    const result = validateSkillPackage({
      files: [{ path: "README.md", type: "file" }],
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("SKILL_MD_MISSING");
    expect(codes(result)).toContain("SKILL_MD_CONTENT_MISSING");
  });

  it("reports a missing name", () => {
    const result = validateSkillPackage({
      skillMd: `---
description: 缺少名称。
---
`,
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("NAME_MISSING");
  });

  it("reports a missing description", () => {
    const result = validateSkillPackage({
      skillMd: `---
name: 缺少描述
---
`,
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("DESCRIPTION_MISSING");
  });

  it("reports invalid YAML", () => {
    const result = validateSkillPackage({
      skillMd: `---
name: [未闭合
description: 测试
---
`,
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("YAML_INVALID");
  });

  it("reports missing Frontmatter", () => {
    const result = validateSkillPackage({ skillMd: "# 普通 Markdown" });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("FRONTMATTER_MISSING");
  });

  it("reports invalid field types", () => {
    const result = validateSkillPackage({
      skillMd: `---
name: 123
description: 合法描述
metadata: invalid
allowed-tools:
  - Read
  - 42
---
`,
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "NAME_TYPE_INVALID",
        "METADATA_TYPE_INVALID",
        "ALLOWED_TOOLS_TYPE_INVALID",
      ]),
    );
  });

  it("reports empty name and description", () => {
    const result = validateSkillPackage({
      skillMd: `---
name: "   "
description: ""
---
`,
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["NAME_EMPTY", "DESCRIPTION_EMPTY"]),
    );
  });

  it("reports path traversal", () => {
    const result = validateSkillPackage({
      skillMd: validSkillMd,
      files: [
        { path: "SKILL.md", type: "file", sizeBytes: 100 },
        { path: "../outside.txt", type: "file", sizeBytes: 10 },
      ],
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("PATH_TRAVERSAL");
  });

  it("reports absolute paths and Windows drive paths", () => {
    const absoluteResult = validateSkillPackage({
      skillMd: validSkillMd,
      files: [
        { path: "SKILL.md", type: "file" },
        { path: "/tmp/outside.txt", type: "file" },
      ],
    });
    const driveResult = validateSkillPackage({
      skillMd: validSkillMd,
      files: [
        { path: "SKILL.md", type: "file" },
        { path: "C:\\outside.txt", type: "file" },
      ],
    });

    expect(codes(absoluteResult)).toContain("ABSOLUTE_PATH");
    expect(codes(driveResult)).toContain("WINDOWS_DRIVE_PATH");
  });

  it("validates the optional skill root path", () => {
    const result = validateSkillPackage({
      skillMd: validSkillMd,
      rootPath: "C:\\skill-package",
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain("WINDOWS_DRIVE_PATH");
  });

  it("allows scripts but reports a warning", () => {
    const result = validateSkillPackage({
      skillMd: validSkillMd,
      files: [
        { path: "SKILL.md", type: "file" },
        { path: "scripts/check.sh", type: "file", sizeBytes: 100 },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.parsedSkill?.scripts).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "SCRIPT_FILE_PRESENT",
        }),
      ]),
    );
  });

  it("reports hidden files, symlinks, dangerous extensions, and size limits", () => {
    const result = validateSkillPackage({
      skillMd: validSkillMd,
      totalSizeBytes: 21 * 1024 * 1024,
      files: [
        { path: "SKILL.md", type: "file" },
        { path: ".env", type: "file", isSymlink: true },
        { path: "payload.exe", type: "file", sizeBytes: 6 * 1024 * 1024 },
      ],
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "HIDDEN_FILE",
        "SYMLINK_RISK",
        "DANGEROUS_EXTENSION",
        "FILE_SIZE_LIMIT",
        "PACKAGE_SIZE_LIMIT",
      ]),
    );
  });
});
