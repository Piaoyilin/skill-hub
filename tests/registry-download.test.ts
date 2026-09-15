import { describe, expect, it } from "vitest";
import {
  SkillPackageStorageError,
  type SkillPackageStorage,
} from "../lib/storage/package";
import { downloadSkillPackage } from "../lib/registry/download";

type FakeVersion = {
  version: string;
  storagePath: string | null;
  packageSize: number | null;
  packageHash: string | null;
};

const asDownloadDb = (db: unknown) => db as any;

function createDownloadFixture(options: {
  versions?: FakeVersion[];
  skill?: { id: string; slug: string; status?: string } | null;
  content?: Uint8Array;
  downloadError?: "missing" | "failed";
} = {}) {
  const updates: unknown[] = [];
  const args: any[] = [];
  const skill = options.skill === undefined
    ? { id: "skill-1", slug: "demo-skill", status: "PUBLISHED" }
    : options.skill;
  const versions = options.versions ?? [
    {
      version: "1.0.0",
      storagePath: "skills/demo-skill/1.0.0/skill.zip",
      packageSize: 4,
      packageHash: "hash",
    },
  ];

  const db = {
    skill: {
      findFirst: async (input: any) => {
        args.push(input);
        if (!skill) return null;
        const requestedVersion = input.select.versions.where.version;
        const selected = requestedVersion
          ? versions.filter((item) => item.version === requestedVersion)
          : versions;
        return { ...skill, versions: selected.slice(0, 1) };
      },
      update: async (input: unknown) => {
        updates.push(input);
        return { id: skill?.id ?? "skill-1" };
      },
    },
  };

  const content = options.content ?? Uint8Array.from([1, 2, 3, 4]);
  const storage: Pick<SkillPackageStorage, "download"> = {
    download: async () => {
      if (options.downloadError === "missing") {
        throw new SkillPackageStorageError(
          "STORAGE_OBJECT_NOT_FOUND",
          "missing",
        );
      }
      if (options.downloadError === "failed") {
        throw new SkillPackageStorageError(
          "STORAGE_DOWNLOAD_FAILED",
          "failed",
        );
      }
      return Uint8Array.from(content);
    },
  };

  return { db, storage, args, updates };
}

describe("downloadSkillPackage", () => {
  it("downloads the latest published package and increments downloads", async () => {
    const fixture = createDownloadFixture();

    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toEqual({
      kind: "success",
      fileName: "demo-skill-1.0.0.zip",
      content: Uint8Array.from([1, 2, 3, 4]),
      version: "1.0.0",
      storagePath: "skills/demo-skill/1.0.0/skill.zip",
      packageSize: 4,
      packageHash: "hash",
    });
    expect(fixture.updates).toEqual([
      {
        where: { id: "skill-1" },
        data: { downloads: { increment: 1 } },
        select: { id: true },
      },
    ]);
  });

  it("downloads an explicitly requested published version", async () => {
    const fixture = createDownloadFixture({
      versions: [
        {
          version: "1.0.0",
          storagePath: "skills/demo-skill/1.0.0/skill.zip",
          packageSize: 1,
          packageHash: "old",
        },
        {
          version: "2.0.0",
          storagePath: "skills/demo-skill/2.0.0/skill.zip",
          packageSize: 2,
          packageHash: "new",
        },
      ],
    });

    const result = await downloadSkillPackage(
      "demo-skill",
      { version: "2.0.0" },
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.version).toBe("2.0.0");
    expect(result.storagePath).toBe("skills/demo-skill/2.0.0/skill.zip");
    expect(fixture.args[0]?.select.versions.where.version).toBe("2.0.0");
  });

  it("returns a stable error for an unknown slug", async () => {
    const fixture = createDownloadFixture({ skill: null });
    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_NOT_FOUND" },
    });
  });

  it("returns a stable error when the requested version is missing", async () => {
    const fixture = createDownloadFixture({ versions: [] });
    const result = await downloadSkillPackage(
      "demo-skill",
      { version: "2.0.0" },
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_VERSION_NOT_FOUND" },
    });
  });

  it("does not invent a package when storagePath is missing", async () => {
    const fixture = createDownloadFixture({
      versions: [
        {
          version: "1.0.0",
          storagePath: null,
          packageSize: null,
          packageHash: null,
        },
      ],
    });

    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "PACKAGE_NOT_AVAILABLE" },
    });
    expect(fixture.updates).toEqual([]);
  });

  it("does not increment downloads when the Storage object is missing", async () => {
    const fixture = createDownloadFixture({ downloadError: "missing" });
    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "STORAGE_OBJECT_NOT_FOUND" },
    });
    expect(fixture.updates).toEqual([]);
  });

  it("does not increment downloads when Storage download fails", async () => {
    const fixture = createDownloadFixture({ downloadError: "failed" });
    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "STORAGE_DOWNLOAD_FAILED" },
    });
    expect(fixture.updates).toEqual([]);
  });

  it("rejects an invalid stored path before accessing Storage", async () => {
    const fixture = createDownloadFixture({
      versions: [
        {
          version: "1.0.0",
          storagePath: "skills/other-skill/1.0.0/skill.zip",
          packageSize: 1,
          packageHash: "hash",
        },
      ],
    });
    let storageCalls = 0;
    const storage = {
      download: async () => {
        storageCalls += 1;
        return Uint8Array.from([1]);
      },
    };

    const result = await downloadSkillPackage(
      "demo-skill",
      {},
      { db: asDownloadDb(fixture.db), storage },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "STORAGE_PATH_INVALID" },
    });
    expect(storageCalls).toBe(0);
  });

  it("allows the authenticated Owner to download an archived Skill package", async () => {
    const fixture = createDownloadFixture({
      skill: {
        id: "skill-archived",
        slug: "demo-skill",
        status: "ARCHIVED",
      },
    });

    const result = await downloadSkillPackage(
      "demo-skill",
      { viewerId: "owner-1" },
      { db: asDownloadDb(fixture.db), storage: fixture.storage },
    );

    expect(result.kind).toBe("success");
    expect(fixture.args[0]?.where).toMatchObject({
      slug: "demo-skill",
      OR: [
        { status: "PUBLISHED" },
        { status: "ARCHIVED", ownerId: "owner-1" },
      ],
    });
  });
});
