import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as yazl from "yazl";
import {
  publishSkillPackage,
  PublishDomainError,
  type PublishTransactionClient,
} from "../lib/registry/publish";
import {
  SkillPackageStorageError,
  type SkillPackageStorage,
} from "../lib/storage/package";

type FakeState = {
  categories: Array<{ id: string; slug: string; name: string }>;
  skills: Array<{
    id: string;
    slug: string;
    displayName: string;
    description: string;
    categoryId: string;
    status: string;
    authorDisplayName: string;
    ownerId?: string | null;
  }>;
  versions: Array<{
    id: string;
    skillId: string;
    version: string;
    skillMd: string;
    manifest: unknown;
    changelog: unknown;
    publishedAt: Date;
    storagePath?: string;
    packageSize?: number;
    packageHash?: string;
  }>;
  files: Array<{
    id: string;
    versionId: string;
    path: string;
    type: "FILE" | "DIRECTORY";
    sizeBytes: number;
    mimeType: string | null;
  }>;
  tags: Array<{ id: string; slug: string; name: string }>;
  skillTags: Array<{ skillId: string; tagId: string }>;
  nextId: number;
};

function createState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    categories: [{ id: "category-frontend", slug: "frontend", name: "前端" }],
    skills: [],
    versions: [],
    files: [],
    tags: [],
    skillTags: [],
    nextId: 1,
    ...overrides,
  };
}

function nextId(state: FakeState, prefix: string) {
  const id = `${prefix}-${state.nextId}`;
  state.nextId += 1;
  return id;
}

function createTransaction(
  state: FakeState,
  options: { failOnFileCreate?: boolean } = {},
) {
  const transaction = {
    category: {
      findFirst: async ({ where }: any) => {
        const requested = where.OR as Array<{ slug?: string; name?: string }>;
        return (
          state.categories.find((category) =>
            requested.some(
              (condition) =>
                (condition.slug && condition.slug === category.slug) ||
                (condition.name && condition.name === category.name),
            ),
          ) ?? null
        );
      },
    },
    skill: {
      findUnique: async ({ where }: any) => {
        if ("slug" in where) {
          const skill = state.skills.find((item) => item.slug === where.slug);
          return skill ? { id: skill.id, ownerId: skill.ownerId ?? null } : null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const skill = {
          id: nextId(state, "skill"),
          slug: data.slug,
          displayName: data.displayName,
          description: data.description,
          categoryId: data.categoryId,
          status: String(data.status),
          authorDisplayName: data.authorDisplayName,
          ownerId: data.ownerId ?? null,
        };
        state.skills.push(skill);
        return { id: skill.id };
      },
      update: async ({ where, data }: any) => {
        const skill = state.skills.find((item) => item.id === where.id);
        if (!skill) throw new Error("skill not found");
        Object.assign(skill, {
          ...(data.displayName === undefined ? {} : { displayName: data.displayName }),
          ...(data.description === undefined ? {} : { description: data.description }),
          ...(data.categoryId === undefined ? {} : { categoryId: data.categoryId }),
          ...(data.status === undefined ? {} : { status: String(data.status) }),
          ...(data.authorDisplayName === undefined
            ? {}
            : { authorDisplayName: data.authorDisplayName }),
          ...(data.ownerId === undefined ? {} : { ownerId: data.ownerId }),
        });
        return { id: skill.id };
      },
    },
    skillVersion: {
      findUnique: async ({ where }: any) => {
        const key = where.skillId_version;
        const version = state.versions.find(
          (item) => item.skillId === key.skillId && item.version === key.version,
        );
        return version ? { id: version.id } : null;
      },
      create: async ({ data }: any) => {
        const version = {
          id: nextId(state, "version"),
          skillId: data.skillId,
          version: data.version,
          skillMd: data.skillMd,
          manifest: data.manifest,
          changelog: data.changelog,
          publishedAt: data.publishedAt as Date,
          storagePath: data.storagePath,
          packageSize: data.packageSize,
          packageHash: data.packageHash,
        };
        state.versions.push(version);
        return { id: version.id };
      },
    },
    skillFile: {
      createMany: async ({ data }: any) => {
        if (options.failOnFileCreate) {
          throw new Error("simulated file write failure");
        }

        for (const item of data) {
          state.files.push({
            id: nextId(state, "file"),
            versionId: item.versionId,
            path: item.path,
            type: String(item.type) as "FILE" | "DIRECTORY",
            sizeBytes: item.sizeBytes,
            mimeType: item.mimeType,
          });
        }
        return { count: data.length };
      },
    },
    tag: {
      upsert: async ({ where, update, create }: any) => {
        const existing = state.tags.find((item) => item.slug === where.slug);
        if (existing) {
          existing.name = update.name;
          return { id: existing.id };
        }

        const tag = {
          id: nextId(state, "tag"),
          slug: create.slug,
          name: create.name,
        };
        state.tags.push(tag);
        return { id: tag.id };
      },
    },
    skillTag: {
      createMany: async ({ data }: any) => {
        for (const item of data) {
          if (
            !state.skillTags.some(
              (current) =>
                current.skillId === item.skillId && current.tagId === item.tagId,
            )
          ) {
            state.skillTags.push(item);
          }
        }
        return { count: data.length };
      },
    },
  };

  return async <T>(
    callback: (tx: PublishTransactionClient) => Promise<T>,
  ) => {
    const snapshot = JSON.parse(JSON.stringify(state)) as FakeState;
    try {
      return await callback(transaction as PublishTransactionClient);
    } catch (error) {
      state.categories = snapshot.categories;
      state.skills = snapshot.skills;
      state.versions = snapshot.versions;
      state.files = snapshot.files;
      state.tags = snapshot.tags;
      state.skillTags = snapshot.skillTags;
      state.nextId = snapshot.nextId;
      throw error;
    }
  };
}

function createStorage(options: {
  existingPaths?: string[];
  failUpload?: boolean;
  failRemove?: boolean;
} = {}) {
  const objects = new Map<string, Uint8Array>();
  const uploads: string[] = [];
  const removals: string[] = [];

  const storage: SkillPackageStorage = {
    exists: async (path) =>
      options.existingPaths?.includes(path) === true || objects.has(path),
    upload: async (path, content) => {
      if (options.failUpload) {
        throw new SkillPackageStorageError(
          "STORAGE_UPLOAD_FAILED",
          "simulated upload failure",
        );
      }
      if (options.existingPaths?.includes(path) || objects.has(path)) {
        throw new SkillPackageStorageError(
          "STORAGE_PATH_EXISTS",
          "simulated storage conflict",
        );
      }
      objects.set(path, Uint8Array.from(content));
      uploads.push(path);
    },
    remove: async (path) => {
      if (options.failRemove) {
        throw new SkillPackageStorageError(
          "STORAGE_DELETE_FAILED",
          "simulated remove failure",
        );
      }
      objects.delete(path);
      removals.push(path);
    },
    download: async (path) => {
      const content = objects.get(path);
      if (!content) {
        throw new SkillPackageStorageError(
          "STORAGE_OBJECT_NOT_FOUND",
          "simulated missing object",
        );
      }
      return Uint8Array.from(content);
    },
  };

  return { storage, objects, uploads, removals };
}

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
        zip.addBuffer(Buffer.from(entry.content ?? "", "utf8"), entry.path);
      }
    }

    zip.end();
  });
}

function skillMd({
  name = "react-performance-audit",
  slug,
  version = "1.0.0",
  extra = "",
}: { name?: string; slug?: unknown; version?: string; extra?: string } = {}) {
  return `---
name: ${name}
${slug === undefined ? "" : `slug: ${String(slug)}
`}description: 用于测试发布流程的 Skill
version: ${version}
author: Skill Hub 测试
metadata:
  displayName: React 性能检查
---

# 使用说明

${extra}
`;
}

async function publish(
  archive: Buffer,
  state: FakeState,
  fields: { category?: string; tags?: string[]; version?: string } = {
    category: "前端",
    tags: ["React", "react", "性能"],
  },
  options: { failOnFileCreate?: boolean } = {},
) {
  const transaction = createTransaction(state, options);
  const storage = createStorage();
  return publishSkillPackage(
    { buffer: archive, fileName: "skill.zip" },
    fields,
    {
      transaction,
      preflight: async () => {},
      storage: storage.storage,
    },
  );
}

describe("publishSkillPackage", () => {
  it("publishes a new Skill, version, files, category, and deduplicated tags", async () => {
    const state = createState();
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd() },
      { path: "references/", directory: true },
      { path: "references/guide.md", content: "guide" },
      { path: "scripts/", directory: true },
      { path: "scripts/check.sh", content: "#!/bin/sh\nexit 0" },
    ]);

    const result = await publish(archive, state);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.skill).toMatchObject({
      slug: "react-performance-audit",
      version: "1.0.0",
      url: "/skills/react-performance-audit",
    });
    expect(state.skills).toHaveLength(1);
    expect(state.skills[0]).toMatchObject({
      displayName: "React 性能检查",
      categoryId: "category-frontend",
      status: "PUBLISHED",
    });
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0]).toMatchObject({
      skillId: state.skills[0]?.id,
      version: "1.0.0",
      storagePath: "skills/react-performance-audit/1.0.0/skill.zip",
      packageSize: archive.byteLength,
      packageHash: createHash("sha256").update(archive).digest("hex"),
    });
    expect(state.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "references",
      "references/guide.md",
      "scripts",
      "scripts/check.sh",
    ]);
    expect(state.tags.map((tag) => tag.name)).toEqual(["React", "性能"]);
    expect(state.skillTags).toHaveLength(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCRIPT_FILE_PRESENT",
          severity: "warning",
        }),
      ]),
    );
  });

  it("creates a new version for an existing Skill without creating another Skill", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-existing",
          slug: "react-performance-audit",
          displayName: "旧名称",
          description: "旧描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "旧作者",
        },
      ],
      versions: [
        {
          id: "version-old",
          skillId: "skill-existing",
          version: "1.0.0",
          skillMd: skillMd(),
          manifest: {},
          changelog: [],
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const archive = await createZip([
      {
        path: "SKILL.md",
        content: skillMd({ version: "1.1.0", extra: "新增检查项" }),
      },
    ]);

    const result = await publish(archive, state, {
      category: "前端",
      tags: ["React"],
    });

    expect(result.kind).toBe("success");
    expect(state.skills).toHaveLength(1);
    expect(state.versions.map((version) => version.version)).toEqual([
      "1.0.0",
      "1.1.0",
    ]);
    expect(state.skills[0]?.id).toBe("skill-existing");
  });

  it("assigns a new Skill to the server-provided Owner", async () => {
    const state = createState();
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "前端" },
      {
        transaction: createTransaction(state),
        preflight: async () => {},
        storage: createStorage().storage,
        owner: {
          id: "profile-1",
          username: "linchen-a1b2c3d4",
          displayName: "林晨",
        },
      },
    );

    expect(result.kind).toBe("success");
    expect(state.skills[0]).toMatchObject({
      ownerId: "profile-1",
      authorDisplayName: "林晨",
    });
  });

  it("allows the Owner to publish a new version", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-owned",
          slug: "react-performance-audit",
          displayName: "旧名称",
          description: "旧描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "林晨",
          ownerId: "profile-1",
        },
      ],
    });
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.1.0" }) },
    ]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "前端" },
      {
        transaction: createTransaction(state),
        preflight: async () => {},
        storage: createStorage().storage,
        owner: {
          id: "profile-1",
          username: "linchen-a1b2c3d4",
          displayName: "林晨",
        },
      },
    );

    expect(result.kind).toBe("success");
    expect(state.versions).toHaveLength(1);
  });

  it("rejects a non-Owner from publishing a new version", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-owned",
          slug: "react-performance-audit",
          displayName: "已有 Skill",
          description: "描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "其他作者",
          ownerId: "profile-owner",
        },
      ],
    });
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.1.0" }) },
    ]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        transaction: createTransaction(state),
        preflight: async (input) => {
          if (input.owner && input.owner.id !== "profile-owner") {
            throw new PublishDomainError(
              "SKILL_PERMISSION_DENIED",
              "无权发布该 Skill 的新版本。",
            );
          }
        },
        storage: createStorage().storage,
        owner: {
          id: "profile-other",
          username: "other-a1b2c3d4",
          displayName: "其他用户",
        },
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_PERMISSION_DENIED" },
    });
    expect(state.versions).toHaveLength(0);
  });

  it("does not allow a user to claim a historical Skill without an Owner", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-legacy",
          slug: "react-performance-audit",
          displayName: "历史 Skill",
          description: "描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "历史作者",
          ownerId: null,
        },
      ],
    });
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.1.0" }) },
    ]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        transaction: createTransaction(state),
        preflight: async (input) => {
          if (input.owner) {
            throw new PublishDomainError(
              "SKILL_PERMISSION_DENIED",
              "历史 Skill 暂不支持普通用户认领。",
            );
          }
        },
        storage: createStorage().storage,
        owner: {
          id: "profile-1",
          username: "linchen-a1b2c3d4",
          displayName: "林晨",
        },
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_PERMISSION_DENIED" },
    });
  });

  it("rejects a duplicate Skill version before writing", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-existing",
          slug: "react-performance-audit",
          displayName: "React 性能检查",
          description: "描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "作者",
        },
      ],
      versions: [
        {
          id: "version-existing",
          skillId: "skill-existing",
          version: "1.0.0",
          skillMd: skillMd(),
          manifest: {},
          changelog: [],
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const before = JSON.stringify(state);
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);

    const result = await publish(archive, state);

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "SKILL_VERSION_EXISTS",
        message: "该 Skill 版本已经存在。",
      },
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("does not invoke the transaction for an invalid ZIP", async () => {
    let transactionCalls = 0;
    const result = await publishSkillPackage(
      { buffer: Buffer.from("not a zip"), fileName: "invalid.zip" },
      { category: "前端" },
      {
        transaction: async () => {
          transactionCalls += 1;
          throw new Error("transaction should not run");
        },
      },
    );

    expect(result.kind).toBe("validation-error");
    if (result.kind !== "validation-error") return;
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ZIP_INVALID", severity: "error" }),
      ]),
    );
    expect(transactionCalls).toBe(0);
  });

  it("does not invoke the transaction when SKILL.md is missing", async () => {
    const archive = await createZip([{ path: "README.md", content: "readme" }]);
    let transactionCalls = 0;

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "missing.zip" },
      { category: "前端" },
      {
        transaction: async () => {
          transactionCalls += 1;
          throw new Error("transaction should not run");
        },
      },
    );

    expect(result.kind).toBe("validation-error");
    expect(transactionCalls).toBe(0);
  });

  it("returns a category error without writing when the category is unknown", async () => {
    const state = createState();
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd() },
    ]);

    const result = await publish(archive, state, { category: "不存在的分类" });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "CATEGORY_NOT_FOUND",
        message: "所选分类不存在，请重新选择已有分类。",
      },
    });
    expect(state.skills).toHaveLength(0);
  });

  it("rolls back all writes when a later file write fails", async () => {
    const state = createState();
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd() },
      { path: "references/guide.md", content: "guide" },
    ]);

    const result = await publish(
      archive,
      state,
      { category: "前端" },
      { failOnFileCreate: true },
    );

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "PUBLISH_FAILED",
        message: "Skill 发布失败，数据库事务已回滚，请稍后重试。",
      },
    });
    expect(state.skills).toHaveLength(0);
    expect(state.versions).toHaveLength(0);
    expect(state.files).toHaveLength(0);
    expect(state.tags).toHaveLength(0);
    expect(state.skillTags).toHaveLength(0);
  });

  it("maps Prisma version uniqueness errors to a stable business code", async () => {
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);
    const storage = createStorage();
    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "前端" },
      {
        preflight: async () => {},
        transaction: async () => {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            {
              code: "P2002",
              clientVersion: "6.19.3",
              meta: { target: ["skillId", "version"] },
            },
          );
        },
        storage: storage.storage,
      },
    );

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "SKILL_VERSION_EXISTS",
        message: "该 Skill 版本已经存在。",
      },
    });
  });

  it("uses a supplied version when SKILL.md does not define one", async () => {
    const state = createState();
    const archive = await createZip([
      {
        path: "SKILL.md",
        content: skillMd({ version: "", extra: "版本由发布表单提供" }).replace(
          "version: \n",
          "",
        ),
      },
    ]);

    const result = await publish(archive, state, {
      category: "前端",
      version: "2.0.0",
    });

    expect(result.kind).toBe("success");
    expect(state.versions[0]?.version).toBe("2.0.0");
  });

  it("does not upload when preflight rejects an existing version", async () => {
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);
    const storage = createStorage();

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        preflight: async () => {
          throw new PublishDomainError(
            "SKILL_VERSION_EXISTS",
            "duplicate version",
          );
        },
        transaction: async () => {
          throw new Error("transaction should not run");
        },
        storage: storage.storage,
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_VERSION_EXISTS" },
    });
    expect(storage.uploads).toEqual([]);
    expect(storage.removals).toEqual([]);
  });

  it("rejects an existing Storage path without uploading or writing", async () => {
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);
    const storage = createStorage({
      existingPaths: ["skills/react-performance-audit/1.0.0/skill.zip"],
    });
    let transactionCalls = 0;

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        preflight: async () => {},
        transaction: async () => {
          transactionCalls += 1;
          throw new Error("transaction should not run");
        },
        storage: storage.storage,
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "STORAGE_PATH_EXISTS" },
    });
    expect(storage.uploads).toEqual([]);
    expect(transactionCalls).toBe(0);
  });

  it("does not write the database when Storage upload fails", async () => {
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);
    const storage = createStorage({ failUpload: true });
    let transactionCalls = 0;

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        preflight: async () => {},
        transaction: async () => {
          transactionCalls += 1;
          throw new Error("transaction should not run");
        },
        storage: storage.storage,
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "STORAGE_UPLOAD_FAILED" },
    });
    expect(transactionCalls).toBe(0);
  });

  it("reports a compensation failure when the database transaction fails and cleanup fails", async () => {
    const archive = await createZip([{ path: "SKILL.md", content: skillMd() }]);
    const storage = createStorage({ failRemove: true });

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      { category: "鍓嶇" },
      {
        preflight: async () => {},
        transaction: async () => {
          throw new Error("simulated transaction failure");
        },
        storage: storage.storage,
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "PUBLISH_COMPENSATION_FAILED" },
    });
    expect(storage.uploads).toEqual([
      "skills/react-performance-audit/1.0.0/skill.zip",
    ]);
    expect(storage.removals).toEqual([]);
  });

  it("uses the confirmed publish details and allows the form version to override the manifest", async () => {
    const state = createState();
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.0.0" }) },
    ]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      {
        category: "前端",
        version: "2.0.0",
        slug: "confirmed-skill",
        displayName: "Confirmed Skill",
        description: "确认页提交的描述",
        tags: ["React"],
      },
      {
        transaction: createTransaction(state),
        preflight: async () => {},
        storage: createStorage().storage,
      },
    );

    expect(result.kind).toBe("success");
    expect(state.skills[0]).toMatchObject({
      slug: "confirmed-skill",
      displayName: "Confirmed Skill",
      description: "确认页提交的描述",
    });
    expect(state.versions[0]?.version).toBe("2.0.0");
  });

  it("allows the publish form to repair an invalid optional manifest slug", async () => {
    const state = createState();
    const archive = await createZip([
      {
        path: "SKILL.md",
        content: skillMd({
          version: "1.0.0",
          slug: 123,
        }),
      },
    ]);

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      {
        category: "前端",
        slug: "repaired-skill",
      },
      {
        transaction: createTransaction(state),
        preflight: async () => {},
        storage: createStorage().storage,
      },
    );

    expect(result.kind).toBe("success");
    expect(state.skills[0]?.slug).toBe("repaired-skill");
  });

  it("does not let a new-version target be changed into another Skill", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-owned",
          slug: "react-performance-audit",
          displayName: "已有 Skill",
          description: "描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "Owner",
          ownerId: "profile-owner",
        },
      ],
    });
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.1.0" }) },
    ]);
    const storage = createStorage();

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      {
        category: "前端",
        slug: "another-skill",
        targetSlug: "react-performance-audit",
      },
      {
        preflight: async () => {},
        transaction: createTransaction(state),
        storage: storage.storage,
        owner: {
          id: "profile-owner",
          username: "owner",
          displayName: "Owner",
        },
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_PERMISSION_DENIED" },
    });
    expect(state.versions).toHaveLength(0);
    expect(storage.removals).toEqual([
      "skills/another-skill/1.1.0/skill.zip",
    ]);
  });

  it("does not let a non-Owner publish through the new-version target", async () => {
    const state = createState({
      skills: [
        {
          id: "skill-owned",
          slug: "react-performance-audit",
          displayName: "已有 Skill",
          description: "描述",
          categoryId: "category-frontend",
          status: "PUBLISHED",
          authorDisplayName: "Owner",
          ownerId: "profile-owner",
        },
      ],
    });
    const archive = await createZip([
      { path: "SKILL.md", content: skillMd({ version: "1.1.0" }) },
    ]);
    const storage = createStorage();

    const result = await publishSkillPackage(
      { buffer: archive, fileName: "skill.zip" },
      {
        category: "前端",
        slug: "react-performance-audit",
        targetSlug: "react-performance-audit",
      },
      {
        preflight: async () => {},
        transaction: createTransaction(state),
        storage: storage.storage,
        owner: {
          id: "profile-other",
          username: "other",
          displayName: "Other",
        },
      },
    );

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "SKILL_PERMISSION_DENIED" },
    });
    expect(state.versions).toHaveLength(0);
    expect(storage.removals).toEqual([
      "skills/react-performance-audit/1.1.0/skill.zip",
    ]);
  });
});
