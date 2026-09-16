export type SkillFileView = {
  name: string;
  type: "file" | "folder";
  size?: string;
};

export type SkillOwnerView = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type SkillVersionView = {
  version: string;
  publishedAt: string;
  changelog: { version: string; date: string; note: string }[];
  isCurrent: boolean;
};

/**
 * Serializable projection used by pages and client components. It is kept
 * separate from Prisma models and from the package parser's input types.
 */
export type SkillView = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  authorHandle: string;
  version: string;
  downloads: number;
  stars: number;
  updatedAt: string;
  createdAt: string;
  icon: string;
  accent: string;
  verified: boolean;
  featured?: boolean;
  packageAvailable?: boolean;
  owner?: SkillOwnerView | null;
  canManage?: boolean;
  files: SkillFileView[];
  readme: string[];
  changelog: { version: string; date: string; note: string }[];
  versions: SkillVersionView[];
  /** Included for the detail view only; list queries omit the raw document. */
  skillMd?: string;
};

export type SkillDetailView = SkillView & {
  /** Server-only database id used to avoid duplicate lookups on detail pages. */
  databaseId?: string;
  /** Server-only owner profile id used for display-only canManage calculation. */
  ownerProfileId?: string | null;
};

export type CategoryView = {
  name: string;
  count: number;
};

export type SkillSort = "relevance" | "newest" | "downloads" | "stars";

export type ListSkillsOptions = {
  search?: string;
  category?: string;
  sort?: SkillSort;
  featured?: boolean;
  limit?: number;
};

export type RegistryDataSource = "mock" | "database";

export type HomeRegistryData = {
  categories: CategoryView[];
  featuredSkills: SkillView[];
  latestSkills: SkillView[];
};

export type OwnedSkillView = Pick<
  SkillView,
  | "slug"
  | "name"
  | "version"
  | "downloads"
  | "updatedAt"
  | "createdAt"
  | "verified"
  | "featured"
> & {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
};

export type ManagedSkillVersionView = {
  version: string;
  publishedAt: string;
  createdAt: string;
  packageSize: number | null;
  packageAvailable: boolean;
  fileCount: number;
  isCurrent: boolean;
};

export type ManagedSkillView = Pick<
  SkillView,
  | "slug"
  | "name"
  | "description"
  | "category"
  | "tags"
  | "author"
  | "authorHandle"
  | "version"
  | "downloads"
  | "stars"
  | "updatedAt"
  | "createdAt"
  | "icon"
  | "accent"
  | "verified"
  | "featured"
> & {
  id: string;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  owner: SkillOwnerView | null;
  versions: ManagedSkillVersionView[];
};
