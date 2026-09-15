import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as yazl from "yazl";
import {
  DEFAULT_SKILL_LIMITS,
  loadSkillPackageFromZip,
} from "../../lib/skills";

const validSkillMd = `---
name: ZIP Skill
description: 用于测试 ZIP 适配器。
---

# 说明
`;

function createZip(
  entries: Array<
    | { path: string; content?: string | Uint8Array; directory?: false; mode?: number }
    | { path: string; directory: true; mode?: number }
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
        zip.addEmptyDirectory(entry.path, { mode: entry.mode });
      } else {
        const content =
          typeof entry.content === "string"
            ? Buffer.from(entry.content)
            : Buffer.from(entry.content ?? "");
        zip.addBuffer(content, entry.path, {
          mode: entry.mode,
        });
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
  end.writeUInt16LE(0, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt16LE(paths.length, 12);
  end.writeUInt32LE(centralData.length, 12 + 4);
  end.writeUInt32LE(localData.length, 16);

  return Buffer.concat([localData, centralData, end]);
}

function codes(result: Awaited<ReturnType<typeof loadSkillPackageFromZip>>) {
  return result.validation.issues.map((item) => item.code);
}

describe("loadSkillPackageFromZip", () => {
  it("loads a package with SKILL.md at the ZIP root", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "references/", directory: true },
      { path: "references/guide.md", content: "guide" },
    ]);

    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(true);
    expect(result.package.skillMd).toBe(validSkillMd);
    expect(result.package.files?.map((file) => file.path)).toEqual([
      "SKILL.md",
      "references",
      "references/guide.md",
    ]);
    expect(
      Buffer.from(
        result.package.files?.find((file) => file.path === "references/guide.md")
          ?.content ?? [],
      ).toString("utf8"),
    ).toBe("guide");
    expect(result.parsedSkill?.references).toHaveLength(2);
  });

  it("normalizes a single top-level directory as the Skill root", async () => {
    const archive = await createZip([
      { path: "my-skill/", directory: true },
      { path: "my-skill/SKILL.md", content: validSkillMd },
      { path: "my-skill/assets/logo.txt", content: "asset" },
    ]);

    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(true);
    expect(result.package.files?.map((file) => file.path)).toEqual([
      "SKILL.md",
      "assets/logo.txt",
    ]);
    expect(result.package.rootPath).toBe(".");
  });

  it("allows scripts but returns a warning", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "scripts/", directory: true },
      { path: "scripts/check.sh", content: "#!/bin/sh\nexit 0" },
    ]);

    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "SCRIPT_FILE_PRESENT",
        }),
      ]),
    );
  });

  it("reports a missing SKILL.md", async () => {
    const archive = await createZip([{ path: "README.md", content: "readme" }]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("SKILL_MD_MISSING");
  });

  it("reports multiple SKILL.md files", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "other/SKILL.md", content: validSkillMd },
    ]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("SKILL_MD_MULTIPLE");
  });

  it("reports SKILL.md outside the supported root layouts", async () => {
    const archive = await createZip([
      { path: "nested/path/SKILL.md", content: validSkillMd },
    ]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("SKILL_MD_NOT_AT_ROOT");
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
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain(code);
  });

  it("reports duplicate paths", async () => {
    const archive = makeRawStoredZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "SKILL.md", content: validSkillMd },
    ]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("DUPLICATE_PATH");
  });

  it("reports file count, single-file, total-size, and directory-depth limits", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      {
        path: "a/b/c/d/e/f/g/h/i/file.txt",
        content: "deep",
      },
      {
        path: "large.txt",
        content: Buffer.alloc(DEFAULT_SKILL_LIMITS.maxFileSizeBytes + 1, 1),
      },
    ]);
    const result = await loadSkillPackageFromZip(archive, {
      limits: {
        ...DEFAULT_SKILL_LIMITS,
        maxFileCount: 2,
        maxPackageSizeBytes: DEFAULT_SKILL_LIMITS.maxFileSizeBytes,
      },
    });

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "FILE_COUNT_LIMIT",
        "FILE_SIZE_LIMIT",
        "PACKAGE_SIZE_LIMIT",
        "DIRECTORY_DEPTH_LIMIT",
      ]),
    );
  });

  it("enforces the decompressed package budget across multiple files", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "first.txt", content: "a".repeat(1000) },
      { path: "second.txt", content: "b".repeat(1000) },
    ]);
    const result = await loadSkillPackageFromZip(archive, {
      limits: {
        ...DEFAULT_SKILL_LIMITS,
        maxPackageSizeBytes: 1500,
        maxFileSizeBytes: 2000,
      },
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ZIP_CONTENT_LIMIT",
          severity: "error",
        }),
        expect.objectContaining({
          code: "PACKAGE_SIZE_LIMIT",
          severity: "error",
        }),
      ]),
    );
  });

  it("reports dangerous extensions and hidden files", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: ".env", content: "SECRET=1" },
      { path: "payload.exe", content: "binary" },
    ]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "HIDDEN_FILE", severity: "warning" }),
        expect.objectContaining({
          code: "DANGEROUS_EXTENSION",
          severity: "warning",
        }),
      ]),
    );
  });

  it("rejects a symlink entry when Unix mode metadata identifies it", async () => {
    const archive = await createZip([
      { path: "SKILL.md", content: validSkillMd },
      { path: "linked", content: "SKILL.md", mode: 0o120777 },
    ]);
    const result = await loadSkillPackageFromZip(archive);

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("SYMLINK_REJECTED");
  });

  it("rejects a malformed ZIP", async () => {
    const result = await loadSkillPackageFromZip(Buffer.from("not a zip"));

    expect(result.validation.valid).toBe(false);
    expect(codes(result)).toContain("ZIP_INVALID");
  });
});
