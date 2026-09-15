import { afterEach, describe, expect, it } from "vitest";
import {
  getRegistryHomeData,
  getRegistrySkillBySlug,
  listRegistryCategories,
  listRegistrySkills,
} from "../lib/registry";

const originalDataSource = process.env.SKILL_DATA_SOURCE;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDataSource === undefined) delete process.env.SKILL_DATA_SOURCE;
  else process.env.SKILL_DATA_SOURCE = originalDataSource;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("Skill Registry mock data source", () => {
  it("returns serializable public skill views", async () => {
    process.env.SKILL_DATA_SOURCE = "mock";

    const skills = await listRegistrySkills({ limit: 2 });

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      slug: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      category: expect.any(String),
      version: expect.any(String),
    });
    expect(() => JSON.stringify(skills)).not.toThrow();
  });

  it("supports search, category filtering, and sorting", async () => {
    process.env.SKILL_DATA_SOURCE = "mock";

    const search = await listRegistrySkills({ search: "React" });
    const category = await listRegistrySkills({ category: "前端" });
    const downloads = await listRegistrySkills({ sort: "downloads", limit: 3 });

    expect(search.some((skill) => skill.slug === "react-performance-audit")).toBe(true);
    expect(category.every((skill) => skill.category === "前端")).toBe(true);
    expect(downloads[0]?.downloads).toBeGreaterThanOrEqual(downloads[1]?.downloads ?? 0);
  });

  it("returns only featured skills for the featured query", async () => {
    process.env.SKILL_DATA_SOURCE = "mock";

    const skills = await listRegistrySkills({ featured: true });

    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((skill) => skill.featured === true)).toBe(true);
  });

  it("returns categories and homepage sections through the registry API", async () => {
    process.env.SKILL_DATA_SOURCE = "mock";

    const categories = await listRegistryCategories();
    const home = await getRegistryHomeData();

    expect(categories[0]).toMatchObject({ name: "全部技能", count: expect.any(Number) });
    expect(home.featuredSkills.length).toBeGreaterThan(0);
    expect(home.latestSkills).toHaveLength(4);
  });

  it("gets a skill by slug and returns null for an unknown slug", async () => {
    process.env.SKILL_DATA_SOURCE = "mock";

    const skill = await getRegistrySkillBySlug("react-performance-audit");
    const missing = await getRegistrySkillBySlug("does-not-exist");

    expect(skill?.name).toBe("React 性能检查");
    expect(missing).toBeNull();
  });
});

describe("Skill Registry database configuration", () => {
  it("does not silently fall back to Mock when DATABASE_URL is missing", async () => {
    process.env.SKILL_DATA_SOURCE = "database";
    delete process.env.DATABASE_URL;

    await expect(listRegistrySkills()).rejects.toThrow("未配置 DATABASE_URL");
  });
});
