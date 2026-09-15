import {
  getSkillDataSource,
  getSkillDataSource as getConfiguredDataSource,
} from "./config";
import {
  getDatabaseHomeData,
  getDatabaseOwnedSkillBySlug,
  getDatabaseSkillBySlug,
  listDatabaseOwnedSkills,
  listDatabaseCategories,
  listDatabaseSkills,
} from "./database";
import {
  getMockHomeData,
  getMockSkillBySlug,
  listMockCategories,
  listMockSkills,
} from "./mock";
import type {
  CategoryView,
  HomeRegistryData,
  ListSkillsOptions,
  ManagedSkillView,
  OwnedSkillView,
  SkillView,
} from "./types";

function databaseError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`数据库 Registry 查询失败：${detail}`, { cause: error });
}

export { getConfiguredDataSource as getSkillDataSource };
export type * from "./types";
export {
  FavoriteError,
  favoriteSkill,
  getFavoriteSkillsForUser,
  getFavoriteStatus,
  getFavoriteStatusForSlug,
  unfavoriteSkill,
  type FavoriteDbClient,
  type FavoriteErrorCode,
} from "./favorites";
export {
  normalizeTags,
  publishSkillPackage,
  type PublishErrorCode,
  type PublishSkillFailure,
  type PublishSkillFields,
  type PublishSkillResult,
  type PublishSkillSource,
  type PublishSkillSuccess,
  type PublishTransactionRunner,
} from "./publish";

export async function listRegistrySkills(
  options: ListSkillsOptions = {},
): Promise<SkillView[]> {
  if (getSkillDataSource() === "mock") {
    return listMockSkills(options);
  }

  try {
    return await listDatabaseSkills(options);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getRegistrySkillBySlug(
  slug: string,
  options: { viewerId?: string } = {},
): Promise<SkillView | null> {
  if (getSkillDataSource() === "mock") {
    return getMockSkillBySlug(slug);
  }

  try {
    return await getDatabaseSkillBySlug(slug, options);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function listRegistryOwnedSkills(
  ownerId: string,
): Promise<OwnedSkillView[]> {
  if (getSkillDataSource() === "mock") {
    return [];
  }

  try {
    return await listDatabaseOwnedSkills(ownerId);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getRegistryOwnedSkillBySlug(
  ownerId: string,
  slug: string,
): Promise<ManagedSkillView | null> {
  if (getSkillDataSource() === "mock") {
    return null;
  }

  try {
    return await getDatabaseOwnedSkillBySlug(ownerId, slug);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function listRegistryCategories(): Promise<CategoryView[]> {
  if (getSkillDataSource() === "mock") {
    return listMockCategories();
  }

  try {
    return await listDatabaseCategories();
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getRegistryHomeData(): Promise<HomeRegistryData> {
  if (getSkillDataSource() === "mock") {
    return getMockHomeData();
  }

  try {
    return await getDatabaseHomeData();
  } catch (error) {
    throw databaseError(error);
  }
}
