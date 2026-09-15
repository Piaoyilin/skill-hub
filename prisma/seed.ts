import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseSkillMd } from "../lib/skills/parser";
import { skills } from "../lib/data";

const prisma = new PrismaClient();

function slugFor(value: string, prefix: string) {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (ascii) return ascii;

  const digest = createHash("sha1").update(value, "utf8").digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function parseFileSize(size?: string) {
  if (!size) return 0;

  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB)$/i.exec(size.trim());
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1;
  return Math.round(amount * multiplier);
}

function mimeTypeForPath(path: string) {
  if (path === "SKILL.md") return "text/markdown";

  const extension = path.toLowerCase().slice(path.lastIndexOf("."));
  const mimeTypes: Record<string, string> = {
    ".css": "text/css",
    ".json": "application/json",
    ".md": "text/markdown",
    ".sh": "text/x-shellscript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".txt": "text/plain",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
  };

  return mimeTypes[extension] ?? null;
}

function dateOrUndefined(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildSkillMd(skill: (typeof skills)[number]) {
  return [
    "---",
    `name: ${skill.slug}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    skill.readme.join("\n\n"),
    "",
  ].join("\n");
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const categoryIds = new Map<string, string>();
  const categoryNames = [...new Set(skills.map((skill) => skill.category))];

  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: { slug: slugFor(name, "category") },
      update: {},
      create: {
        slug: slugFor(name, "category"),
        name,
      },
    });
    categoryIds.set(name, category.id);
  }

  const tagIds = new Map<string, string>();
  const tagNames = [...new Set(skills.flatMap((skill) => skill.tags))];

  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { slug: slugFor(name, "tag") },
      update: {},
      create: {
        slug: slugFor(name, "tag"),
        name,
      },
    });
    tagIds.set(name, tag.id);
  }

  let created = 0;
  let skipped = 0;

  for (const skill of skills) {
    const existing = await prisma.skill.findUnique({
      where: { slug: skill.slug },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const skillMd = buildSkillMd(skill);
    const parsed = parseSkillMd(skillMd);
    const createdAt = dateOrUndefined(skill.createdAt);
    const publishedAt = dateOrUndefined(skill.changelog[0]?.date) ?? createdAt;
    const categoryId = categoryIds.get(skill.category);

    if (!categoryId) {
      throw new Error(`缺少分类：${skill.category}`);
    }

    await prisma.skill.create({
      data: {
        slug: skill.slug,
        displayName: skill.name,
        description: skill.description,
        categoryId,
        status: "PUBLISHED",
        authorDisplayName: skill.author,
        authorHandle: skill.authorHandle,
        icon: skill.icon,
        accent: skill.accent,
        verified: skill.verified,
        featured: Boolean(skill.featured),
        downloads: skill.downloads,
        stars: skill.stars,
        ...(createdAt ? { createdAt } : {}),
        skillTags: {
          create: skill.tags.map((tagName) => ({
            tag: {
              connect: { id: tagIds.get(tagName) },
            },
          })),
        },
        versions: {
          create: {
            version: skill.version,
            skillMd,
            manifest: jsonValue(parsed.manifest),
            changelog: jsonValue(skill.changelog),
            ...(publishedAt ? { publishedAt } : {}),
            files: {
              create: [
                {
                  path: "SKILL.md",
                  type: "FILE",
                  sizeBytes: Buffer.byteLength(skillMd, "utf8"),
                  mimeType: "text/markdown",
                },
                ...skill.files
                  .filter((file) => file.name !== "SKILL.md")
                  .map((file) => ({
                    path: file.name,
                    type: file.type === "folder" ? ("DIRECTORY" as const) : ("FILE" as const),
                    sizeBytes: file.type === "folder" ? 0 : parseFileSize(file.size),
                    mimeType: file.type === "folder" ? null : mimeTypeForPath(file.name),
                  })),
              ],
            },
          },
        },
      },
    });

    created += 1;
  }

  console.log(`Seed 完成：创建 ${created} 条 Skill，跳过 ${skipped} 条已存在记录。`);
}

main()
  .catch((error) => {
    console.error("Seed 失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
