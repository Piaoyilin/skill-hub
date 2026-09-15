import { categories as mockCategories, skills as mockSkills } from "../data";
import type {
  CategoryView,
  ListSkillsOptions,
  SkillSort,
  SkillView,
  SkillVersionView,
} from "./types";

function toMockVersions(skill: (typeof mockSkills)[number]): SkillVersionView[] {
  if (skill.changelog.length === 0) {
    return [
      {
        version: skill.version,
        publishedAt: skill.createdAt,
        changelog: [],
        isCurrent: true,
      },
    ];
  }

  return skill.changelog.map((item, index) => ({
    version: item.version,
    publishedAt: item.date,
    changelog: [item],
    isCurrent: index === 0,
  }));
}

function cloneSkill(skill: (typeof mockSkills)[number]): SkillView {
  return {
    ...skill,
    tags: [...skill.tags],
    files: skill.files.map((file) => ({ ...file })),
    readme: [...skill.readme],
    changelog: skill.changelog.map((item) => ({ ...item })),
    versions: toMockVersions(skill),
    packageAvailable: false,
    owner: null,
    canManage: false,
  };
}

function sortSkills(skills: SkillView[], sort: SkillSort = "relevance") {
  return skills.sort((a, b) => {
    if (sort === "newest") {
      return b.createdAt.localeCompare(a.createdAt);
    }

    if (sort === "downloads") {
      return b.downloads - a.downloads;
    }

    if (sort === "stars") {
      return b.stars - a.stars;
    }

    return (
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      b.updatedAt.localeCompare(a.updatedAt)
    );
  });
}

export function listMockSkills(options: ListSkillsOptions = {}): SkillView[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  const filtered = mockSkills
    .map((skill) => cloneSkill(skill))
    .filter((skill) => {
      const matchesSearch =
        !search ||
        [
          skill.name,
          skill.description,
          skill.category,
          skill.author,
          ...skill.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesCategory =
        !options.category ||
        options.category === "全部技能" ||
        skill.category === options.category;
      const matchesFeatured =
        options.featured === undefined ||
        Boolean(skill.featured) === options.featured;

      return matchesSearch && matchesCategory && matchesFeatured;
    });

  const sorted = sortSkills(filtered, options.sort);
  return options.limit === undefined
    ? sorted
    : sorted.slice(0, Math.max(0, options.limit));
}

export function getMockSkillBySlug(slug: string): SkillView | null {
  const skill = mockSkills.find((item) => item.slug === slug);
  return skill ? cloneSkill(skill) : null;
}

export function listMockCategories(): CategoryView[] {
  return mockCategories.map((category) => ({ ...category }));
}

export function getMockHomeData() {
  return {
    categories: listMockCategories(),
    featuredSkills: listMockSkills({ featured: true }),
    latestSkills: listMockSkills({ sort: "newest", limit: 4 }),
  };
}
