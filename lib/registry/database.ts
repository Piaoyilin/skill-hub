import { parseSkillMd } from "../skills/parser";
import { getConfiguredPrisma } from "../db/client";
import type { SkillStatus } from "@prisma/client";
import type {
  CategoryView,
  HomeRegistryData,
  ListSkillsOptions,
  ManagedSkillView,
  OwnedSkillView,
  SkillView,
  SkillVersionView,
} from "./types";

export const publicSkillWhere = { status: "PUBLISHED" as SkillStatus };

export const publicVersionInclude = {
  where: { publishedAt: { not: null } },
  orderBy: [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }],
  take: 1,
  include: { files: { orderBy: { path: "asc" as const } } },
};

const publicVersionHistoryInclude = {
  where: { publishedAt: { not: null } },
  orderBy: [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }],
  include: { files: { orderBy: { path: "asc" as const } } },
};

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function readmeFromSkillMd(skillMd: string, fallback: string) {
  try {
    const body = parseSkillMd(skillMd).body.trim();
    const paragraphs = body
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.replace(/^#+\s*/gm, "").trim())
      .filter(Boolean);
    return paragraphs.length > 0 ? paragraphs : [fallback];
  } catch {
    return [fallback];
  }
}

export function toSkillView(
  skill: DatabaseSkill,
  options: { includeSkillMd?: boolean; viewerId?: string } = {},
): SkillView {
  const version = skill.versions[0];
  const versions = skill.versions.map((item, index): SkillVersionView => ({
    version: item.version,
    publishedAt: formatDate(item.publishedAt ?? item.createdAt),
    changelog: Array.isArray(item.changelog)
      ? item.changelog.filter(isChangelogItem)
      : [],
    isCurrent: index === 0,
  }));
  const changelog = Array.isArray(version?.changelog)
    ? version.changelog.filter(isChangelogItem)
    : [];

  return {
    slug: skill.slug,
    name: skill.displayName,
    description: skill.description,
    category: skill.category.name,
    tags: skill.skillTags.map(({ tag }) => tag.name),
    author: skill.authorDisplayName,
    authorHandle: skill.authorHandle ?? "",
    version: version?.version ?? "未发布",
    downloads: skill.downloads,
    stars: skill.stars,
    updatedAt: formatDate(skill.updatedAt),
    createdAt: formatDate(skill.createdAt),
    icon: skill.icon,
    accent: skill.accent,
    verified: skill.verified,
    featured: skill.featured,
    packageAvailable: Boolean(version?.storagePath),
    owner: skill.owner
      ? {
          username: skill.owner.username,
          displayName: skill.owner.displayName,
          avatarUrl: skill.owner.avatarUrl,
        }
      : null,
    ...(options.viewerId
      ? { canManage: Boolean(skill.owner && skill.owner.id === options.viewerId) }
      : {}),
    files:
      version?.files.map((file) => ({
        name: file.path,
        type: file.type === "DIRECTORY" ? "folder" : "file",
        ...(file.type === "FILE" ? { size: formatFileSize(file.sizeBytes) } : {}),
      })) ?? [],
    readme: readmeFromSkillMd(version?.skillMd ?? "", skill.description),
    changelog,
    versions,
    ...(options.includeSkillMd && version?.skillMd
      ? { skillMd: version.skillMd }
      : {}),
  };
}

function isChangelogItem(
  value: unknown,
): value is { version: string; date: string; note: string } {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.version === "string" &&
    typeof item.date === "string" &&
    typeof item.note === "string"
  );
}

export type DatabaseSkill = Awaited<ReturnType<typeof findPublishedSkills>>[number];

async function findPublishedSkills(options: ListSkillsOptions = {}) {
  const prisma = getConfiguredPrisma();
  const search = options.search?.trim();
  const where = {
    ...publicSkillWhere,
    ...(options.category && options.category !== "全部技能"
      ? { category: { name: options.category } }
      : {}),
    ...(options.featured === undefined ? {} : { featured: options.featured }),
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
            { category: { name: { contains: search, mode: "insensitive" as const } } },
            { authorDisplayName: { contains: search, mode: "insensitive" as const } },
            { skillTags: { some: { tag: { name: { contains: search, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const orderBy =
    options.sort === "newest"
      ? [{ createdAt: "desc" as const }]
      : options.sort === "downloads"
        ? [{ downloads: "desc" as const }, { updatedAt: "desc" as const }]
        : options.sort === "stars"
          ? [{ stars: "desc" as const }, { updatedAt: "desc" as const }]
          : [{ featured: "desc" as const }, { updatedAt: "desc" as const }];

  return prisma.skill.findMany({
    where,
    orderBy,
    ...(options.limit === undefined ? {} : { take: options.limit }),
    include: {
      category: true,
      owner: true,
      skillTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      versions: publicVersionInclude,
    },
  });
}

export async function listDatabaseSkills(
  options: ListSkillsOptions = {},
): Promise<SkillView[]> {
  const skills = await findPublishedSkills(options);
  return skills
    .filter((skill) => skill.versions.length > 0)
    .map((skill) => toSkillView(skill));
}

export async function getDatabaseSkillBySlug(
  slug: string,
  options: { viewerId?: string } = {},
): Promise<SkillView | null> {
  const prisma = getConfiguredPrisma();
  const skill = await prisma.skill.findFirst({
    where: { ...publicSkillWhere, slug },
    include: {
      category: true,
      owner: true,
      skillTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      versions: publicVersionHistoryInclude,
    },
  });

  return skill
    ? toSkillView(skill, { includeSkillMd: true, viewerId: options.viewerId })
    : null;
}

export async function listDatabaseOwnedSkills(
  ownerId: string,
): Promise<OwnedSkillView[]> {
  const prisma = getConfiguredPrisma();
  const skills = await prisma.skill.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { version: true },
      },
    },
  });

  return skills.map((skill) => ({
    slug: skill.slug,
    name: skill.displayName,
    version: skill.versions[0]?.version ?? "未发布",
    downloads: skill.downloads,
    updatedAt: formatDate(skill.updatedAt),
    createdAt: formatDate(skill.createdAt),
    verified: skill.verified,
    featured: skill.featured,
    status: skill.status,
  }));
}

export async function getDatabaseOwnedSkillBySlug(
  ownerId: string,
  slug: string,
): Promise<ManagedSkillView | null> {
  const prisma = getConfiguredPrisma();
  const skill = await prisma.skill.findFirst({
    where: { ownerId, slug },
    include: {
      category: true,
      owner: true,
      skillTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        include: { files: { select: { id: true } } },
      },
    },
  });

  if (!skill) return null;

  const currentVersion = skill.versions[0];
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.displayName,
    description: skill.description,
    category: skill.category.name,
    tags: skill.skillTags.map(({ tag }) => tag.name),
    author: skill.authorDisplayName,
    authorHandle: skill.authorHandle ?? "",
    version: currentVersion?.version ?? "未发布",
    downloads: skill.downloads,
    stars: skill.stars,
    updatedAt: formatDate(skill.updatedAt),
    createdAt: formatDate(skill.createdAt),
    icon: skill.icon,
    accent: skill.accent,
    verified: skill.verified,
    featured: skill.featured,
    status: skill.status,
    owner: skill.owner
      ? {
          username: skill.owner.username,
          displayName: skill.owner.displayName,
          avatarUrl: skill.owner.avatarUrl,
        }
      : null,
    versions: skill.versions.map((version, index) => ({
      version: version.version,
      publishedAt: formatDate(version.publishedAt ?? version.createdAt),
      createdAt: formatDate(version.createdAt),
      packageSize: version.packageSize,
      packageAvailable: Boolean(version.storagePath),
      fileCount: version.files.length,
      isCurrent: index === 0,
    })),
  };
}

export async function listDatabaseCategories(): Promise<CategoryView[]> {
  const prisma = getConfiguredPrisma();
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      skills: {
        where: publicSkillWhere,
        select: { id: true },
      },
    },
  });
  const total = categories.reduce((count, category) => count + category.skills.length, 0);

  return [
    { name: "全部技能", count: total },
    ...categories.map((category) => ({
      name: category.name,
      count: category.skills.length,
    })),
  ];
}

export async function getDatabaseHomeData(): Promise<HomeRegistryData> {
  const [categories, featuredSkills, latestSkills] = await Promise.all([
    listDatabaseCategories(),
    listDatabaseSkills({ featured: true }),
    listDatabaseSkills({ sort: "newest", limit: 4 }),
  ]);

  return { categories, featuredSkills, latestSkills };
}
