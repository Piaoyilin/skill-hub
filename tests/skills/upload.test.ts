import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as yazl from "yazl";
import {
  DEFAULT_SKILL_LIMITS,
  analyzeSkillUpload,
  type SkillLimits,
} from "../../lib/skills";

const validSkillMd = `---
name: Upload Skill
description: 用于测试真实上传预览
version: 1.0.0
allowed-tools: Read Write
---

# 使用说明
`;

function createZip(
  entries: Array<
    | { path: string; content?: string | Uint8Array; directory?: false }
    | { path: string; directory: true }
  >,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks: Buffer[] = [];

    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));

    for (const entry of entries) {
      if (entry.directory) {
        zip.addEmptyDirectory(entry.path);
      } else {
        const content =
          typeof entry.content === "string"
            ? Buffer.from(entry.content)
            : Buffer.from(entry.content ?? "");
        zip.addBuffer(content, entry.path);
      }
    }

    zip.end();
  });
}

function makeRawStoredZip(paths: Array<{ path: string; content?: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const item of paths) {
    const name = Buffer.from(item.path, "utf8");
    const content = Buffer.from(item.content ?? "");
    const local = Buffer.alloc(30 + name.length + content.length);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    content.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralData, end]);
}

function limits(overrides: Partial<SkillLimits>): SkillLimits {
  return { ...DEFAULT_SKILL_LIMITS, ...overrides };
}

describe("analyzeSkillUpload", () => {
  it("returns a bounded preview for a valid root package", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "references/", directory: true },
      { path: "references/guide.md", content: "guide" },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "upload-skill.zip",
    });

    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;

    expect(result.preview.skill).toMatchObject({
      name: "Upload Skill",
      description: "用于测试真实上传预览",
      version: "1.0.0",
      allowedTools: ["Read", "Write"],
    });
    expect(result.preview.references.map((file) => file.path)).toEqual([
      "references",
      "references/guide.md",
    ]);
    expect(result.preview.validation.valid).toBe(true);
    expect(result.preview.packageSizeBytes).toBe(archive.byteLength);
    expect(result.preview.skillMdPreview).toContain("# 使用说明");
    expect(result.preview.files).not.toContainEqual(
      expect.objectContaining({ content: expect.anything() }),
    );
  });

  it("supports a single top-level directory", async () => {
    const archive = await createZip([
      { path: "my-skill/", directory: true },
      { path: "my-skill/SKILL.md", content: validSkillMd },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "my-skill.zip",
    });

    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.preview.skill?.name).toBe("Upload Skill");
    expect(result.preview.files.map((file) => file.path)).toEqual(["SKILL.md"]);
  });

  it("reports scripts as warnings without rejecting the package", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "scripts/", directory: true },
      { path: "scripts/check.sh", content: "#!/bin/sh\nexit 0" },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "scripts.zip",
    });

    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.preview.validation.valid).toBe(true);
    expect(result.preview.scripts).toHaveLength(1);
    expect(result.preview.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCRIPT_FILE_PRESENT",
          severity: "warning",
        }),
      ]),
    );
  });

  it("returns a structured validation preview when SKILL.md is missing", async () => {
    const archive = await createZip([
      { path: "README.md", content: "readme" },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "missing-skill.zip",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.preview?.validation.valid).toBe(false);
    expect(result.preview?.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SKILL_MD_MISSING" }),
      ]),
    );
  });

  it("returns a structured validation preview for invalid YAML", async () => {
    const archive = await createZip([
      {
        path: "SKILL.md",
        content: "---\nname: [\ndescription: broken\n---\n",
      },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "invalid-yaml.zip",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.preview?.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "YAML_INVALID", severity: "error" }),
      ]),
    );
  });

  it("rejects non-ZIP filenames and empty uploads before parsing", async () => {
    const nonZip = await analyzeSkillUpload({
      buffer: Buffer.from("not a zip"),
      fileName: "skill.txt",
    });
    const empty = await analyzeSkillUpload({
      buffer: new Uint8Array(),
      fileName: "empty.zip",
    });

    expect(nonZip).toEqual({
      kind: "error",
      error: {
        code: "FILE_TYPE_INVALID",
        message: "只支持上传 ZIP 格式的技能包。",
      },
    });
    expect(empty).toEqual({
      kind: "error",
      error: {
        code: "FILE_EMPTY",
        message: "上传的 ZIP 文件为空。",
      },
    });
  });

  it("rejects an upload over the configured archive size limit", async () => {
    const result = await analyzeSkillUpload(
      {
        buffer: Buffer.from("12345678901"),
        fileName: "too-large.zip",
      },
      { limits: limits({ maxPackageSizeBytes: 10 }) },
    );

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "FILE_SIZE_LIMIT",
        message: "ZIP 文件大小不能超过 10 字节。",
      },
    });
  });

  it.each([
    ["../outside.txt", "PATH_TRAVERSAL"],
    ["/absolute.txt", "ABSOLUTE_PATH"],
    ["C:/outside.txt", "ABSOLUTE_PATH"],
  ])("rejects unsafe ZIP path %s", async (path, code) => {
    const archive = makeRawStoredZip([
      { path, content: "unsafe" },
      { path: "SKILL.md", content: validSkillMd },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "unsafe.zip",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.preview?.validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it("surfaces file, package, and directory limits from the existing validator", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "large.txt", content: "x".repeat(2_000) },
      { path: "a/b/deep.txt", content: "deep" },
    ]);

    const result = await analyzeSkillUpload(
      {
        buffer: archive,
        fileName: "limits.zip",
      },
      {
        limits: limits({
          maxFileSizeBytes: 10,
          maxPackageSizeBytes: 1_000,
          maxDirectoryDepth: 1,
        }),
      },
    );

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.preview?.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FILE_SIZE_LIMIT" }),
        expect.objectContaining({ code: "PACKAGE_SIZE_LIMIT" }),
        expect.objectContaining({ code: "DIRECTORY_DEPTH_LIMIT" }),
      ]),
    );
  });

  it("reports dangerous extensions and hidden files as security issues", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: ".env", content: "SECRET=1" },
      { path: "payload.exe", content: "binary" },
    ]);

    const result = await analyzeSkillUpload({
      buffer: archive,
      fileName: "security.zip",
    });

    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.preview.validation.valid).toBe(true);
    expect(result.preview.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "HIDDEN_FILE", severity: "warning" }),
        expect.objectContaining({
          code: "DANGEROUS_EXTENSION",
          severity: "warning",
        }),
      ]),
    );
  });

  it("returns a structured error for malformed ZIP data", async () => {
    const result = await analyzeSkillUpload({
      buffer: Buffer.from("not a zip"),
      fileName: "broken.zip",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error.code).toBe("ZIP_INVALID");
    expect(result.preview?.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ZIP_INVALID", severity: "error" }),
      ]),
    );
  });
});
