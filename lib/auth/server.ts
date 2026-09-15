import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { getConfiguredPrisma } from "@/lib/db/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  authUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CurrentUser = {
  authUser: SupabaseAuthUser;
  profile: UserProfile;
};

type ProfileDb = Pick<PrismaClient, "user">;

function metadataValue(user: SupabaseAuthUser, keys: string[]) {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== "object") return "";

  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";

}

function profileDisplayName(user: SupabaseAuthUser) {
  return (
    metadataValue(user, ["display_name", "full_name", "name"]) ||
    "Skill Hub 用户"
  );

}

function profileUsername(user: SupabaseAuthUser) {
  const metadataUsername = metadataValue(user, ["user_name", "username"]);
  const base = (metadataUsername || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user";
  return `${base}-${user.id.replace(/[^a-z0-9]/gi, "").slice(0, 8)}`;

}

function profileAvatarUrl(user: SupabaseAuthUser) {
  const value = metadataValue(user, ["avatar_url", "picture"]);
  return value || null;

}

export async function ensureProfile(
  authUser: SupabaseAuthUser,
  dependencies: { db?: ProfileDb } = {},
): Promise<UserProfile> {
  const db = dependencies.db ?? getConfiguredPrisma();
  return db.user.upsert({
    where: { authUserId: authUser.id },
    update: {
      displayName: profileDisplayName(authUser),
      avatarUrl: profileAvatarUrl(authUser),
    },
    create: {
      authUserId: authUser.id,
      username: profileUsername(authUser),
      displayName: profileDisplayName(authUser),
      avatarUrl: profileAvatarUrl(authUser),
    },
    select: {
      id: true,
      authUserId: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

}

export async function getCurrentAuthUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;

}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const authUser = await getCurrentAuthUser();
  if (!authUser) return null;
  const profile = await ensureProfile(authUser);
  return { authUser, profile };

}
