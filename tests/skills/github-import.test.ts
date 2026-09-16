import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import * as yazl from "yazl";
import {
  DEFAULT_SKILL_LIMITS,
  importGithubSkill,
  loadSkillPackageFromZip,
  parseGithubRepositoryUrl,
} from "../../lib/skills";

const validSkillMd = `---
name: GitHub Skill
description: A skill imported from GitHub
version: 1.0.0
---

# Usage
`;

function createZip(
  entries: Array<{ path: string; content?: string; directory?: boolean }>,
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
        zip.addBuffer(Buffer.from(entry.content ?? ""), entry.path);
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
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, end]);
}

function mockGithubFetch(archive: Buffer, metadata = {}) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          full_name: "example/my-skill",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/example/my-skill",
          ...metadata,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

describe("GitHub Import v1", () => {
  it("parses supported GitHub repository URLs", () => {
    expect(parseGithubRepositoryUrl("https://github.com/example/my-skill")).toEqual({
      owner: "example",
      repo: "my-skill",
      url: "https://github.com/example/my-skill",
    });
    expect(parseGithubRepositoryUrl("https://github.com/example/my-skill.git/")).toEqual({
      owner: "example",
      repo: "my-skill",
      url: "https://github.com/example/my-skill",
    });
  });

  it.each([
    "http://github.com/example/my-skill",
    "https://github.com/example/my-skill/issues",
    "https://github.com/example/my-skill?tab=readme",
    "https://github.com/example/%2Fmy-skill",
    "https://github.com:443/example/my-skill",
    "github.com/example/my-skill",
  ])("rejects invalid repository URL %s", (url) => {
    expect(parseGithubRepositoryUrl(url)).toEqual({ error: "URL_INVALID" });
  });

  it.each([
    "https://gitlab.com/example/my-skill",
    "https://github.com.evil.example/example/my-skill",
    "https://127.0.0.1/example/my-skill",
  ])("rejects unsupported hosts %s", (url) => {
    expect(parseGithubRepositoryUrl(url)).toEqual({ error: "UNSUPPORTED_HOST" });
  });

  it("imports the default branch and returns a normalized ZIP", async () => {
    const archive = await createZip([
      { path: "my-skill/", directory: true },
      { path: "my-skill/SKILL.md", content: validSkillMd },
      { path: "my-skill/scripts/", directory: true },
      { path: "my-skill/scripts/check.sh", content: "#!/bin/sh\nexit 0" },
      { path: "my-skill/references/guide.md", content: "guide" },
    ]);
    const { calls, fetcher } = mockGithubFetch(archive);

    const result = await importGithubSkill(
      "https://github.com/example/my-skill.git/",
      { fetch: fetcher },
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.repository).toMatchObject({
      fullName: "example/my-skill",
      defaultBranch: "main",
    });
    expect(result.preview.validation.valid).toBe(true);
    expect(result.preview.scripts).toHaveLength(1);
    expect(result.preview.files.map((file) => file.path)).toContain("SKILL.md");
    expect(calls[0]).toBe("https://api.github.com/repos/example/my-skill");
    expect(calls[1]).toContain(
      "https://api.github.com/repos/example/my-skill/zipball/main",
    );

    const normalized = Buffer.from(result.packageBase64, "base64");
    const loaded = await loadSkillPackageFromZip(normalized);
    expect(loaded.validation.valid).toBe(true);
    expect(loaded.package.files?.map((file) => file.path)).not.toContain(
      "my-skill/SKILL.md",
    );
  });

  it("allows scripts as warnings and never executes them", async () => {
    const archive = await createZip([
      { path: "repo/SKILL.md", content: validSkillMd },
      {
        path: "repo/scripts/should-not-run.sh",
        content: "throw new Error('must not execute')",
      },
    ]);
    const { fetcher } = mockGithubFetch(archive);

    const result = await importGithubSkill("https://github.com/example/my-skill", {
      fetch: fetcher,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.preview.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCRIPT_FILE_PRESENT",
          severity: "warning",
        }),
      ]),
    );
  });

  it("maps a missing root SKILL.md to the stable import error", async () => {
    const archive = await createZip([
      { path: "repo/README.md", content: "readme" },
    ]);
    const { fetcher } = mockGithubFetch(archive);

    const result = await importGithubSkill("https://github.com/example/my-skill", {
      fetch: fetcher,
    });

    expect(result).toMatchObject({
      kind: "validation-error",
      error: {
        code: "SKILL_MD_NOT_FOUND",
        message: "仓库根目录未找到 SKILL.md。",
      },
    });
  });

  it("returns the existing validation preview for invalid SKILL.md", async () => {
    const archive = await createZip([
      { path: "repo/SKILL.md", content: "---\nname: [\n---\n" },
    ]);
    const { fetcher } = mockGithubFetch(archive);

    const result = await importGithubSkill("https://github.com/example/my-skill", {
      fetch: fetcher,
    });

    expect(result.kind).toBe("validation-error");
    if (result.kind !== "validation-error") return;
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.preview.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "YAML_INVALID", severity: "error" }),
      ]),
    );
  });

  it("rejects dangerous paths and oversized archives", async () => {
    const dangerousArchive = makeRawStoredZip([
      { path: "../outside.txt", content: "unsafe" },
      { path: "repo/SKILL.md", content: validSkillMd },
    ]);
    const dangerous = mockGithubFetch(dangerousArchive);
    const dangerousResult = await importGithubSkill(
      "https://github.com/example/my-skill",
      { fetch: dangerous.fetcher },
    );
    expect(dangerousResult).toMatchObject({
      kind: "validation-error",
      error: { code: "VALIDATION_FAILED" },
    });

    const archive = await createZip([
      { path: "repo/SKILL.md", content: validSkillMd },
    ]);
    const oversized = mockGithubFetch(archive);
    const oversizedResult = await importGithubSkill(
      "https://github.com/example/my-skill",
      {
        fetch: oversized.fetcher,
        limits: { ...DEFAULT_SKILL_LIMITS, maxPackageSizeBytes: 10 },
      },
    );
    expect(oversizedResult).toMatchObject({
      kind: "error",
      error: { code: "PACKAGE_TOO_LARGE" },
    });
  });

  it("rejects oversized repository metadata before downloading the archive", async () => {
    const archive = await createZip([
      { path: "repo/SKILL.md", content: validSkillMd },
    ]);
    const { calls, fetcher } = mockGithubFetch(archive, {
      size: Math.ceil(DEFAULT_SKILL_LIMITS.maxPackageSizeBytes / 1024) + 1,
    });

    const result = await importGithubSkill("https://github.com/example/large", {
      fetch: fetcher,
    });

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "PACKAGE_TOO_LARGE" },
    });
    expect(calls).toEqual(["https://api.github.com/repos/example/large"]);
  });

  it("times out a stalled GitHub request without hanging forever", async () => {
    const fetcher = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    const result = await importGithubSkill("https://github.com/example/slow", {
      fetch: fetcher,
      timeouts: { metadataMs: 5 },
    });

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "FETCH_FAILED" },
    });
  });

  it("maps repository and GitHub API failures without exposing response details", async () => {
    const notFound = vi.fn(async () => new Response("not found", { status: 404 }));
    await expect(
      importGithubSkill("https://github.com/example/missing", {
        fetch: notFound as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      kind: "error",
      error: { code: "REPOSITORY_NOT_FOUND", message: "未找到该公开仓库" },
    });

    const rateLimited = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        }),
    );
    await expect(
      importGithubSkill("https://github.com/example/rate-limited", {
        fetch: rateLimited as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      kind: "error",
      error: { code: "GITHUB_RATE_LIMIT" },
    });
  });

  it("rejects redirects outside the trusted GitHub hosts", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/internal" },
      });
    }) as unknown as typeof fetch;

    const result = await importGithubSkill(
      "https://github.com/example/redirected",
      { fetch: fetcher },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "FETCH_FAILED" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("follows the GitHub archive redirect without fetching an arbitrary host", async () => {
    const archive = await createZip([
      { path: "repo/SKILL.md", content: validSkillMd },
    ]);
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            full_name: "example/redirected",
            private: false,
            default_branch: "main",
            html_url: "https://github.com/example/redirected",
          }),
          { status: 200 },
        );
      }
      if (calls.length === 2) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://codeload.github.com/example/redirected/legacy.zip/main" },
        });
      }
      return new Response(new Uint8Array(archive), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await importGithubSkill(
      "https://github.com/example/redirected",
      { fetch: fetcher },
    );

    expect(result.kind).toBe("success");
    expect(calls).toEqual([
      "https://api.github.com/repos/example/redirected",
      "https://api.github.com/repos/example/redirected/zipball/main",
      "https://codeload.github.com/example/redirected/legacy.zip/main",
    ]);
  });
});
