import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { getConfiguredPrisma } from "@/lib/db/client";
import { logTiming, measureAsync } from "@/lib/diagnostics/timing";
import {
  getSupabaseServerClient,
  requestHasSupabaseAuthCookie,
} from "@/lib/supabase/server";

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

const profileSelect = {
  id: true,
  authUserId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

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
  const displayName = profileDisplayName(authUser);
  const avatarUrl = profileAvatarUrl(authUser);
  const existing = await db.user.findUnique({
    where: { authUserId: authUser.id },
    select: profileSelect,
  });

  if (!existing) {
    try {
      return await db.user.create({
        data: {
          authUserId: authUser.id,
          username: profileUsername(authUser),
          displayName,
          avatarUrl,
        },
        select: profileSelect,
      });
    } catch (error) {
      const recovered = await db.user.findUnique({
        where: { authUserId: authUser.id },
        select: profileSelect,
      });
      if (recovered) return recovered;
      throw error;
    }
  }

  if (existing.displayName === displayName && existing.avatarUrl === avatarUrl) {
    return existing;
  }

  return db.user.update({
    where: { authUserId: authUser.id },
    data: { displayName, avatarUrl },
    select: profileSelect,
  });

}

export async function getCurrentAuthUser(options: { route?: string } = {}) {
  const hasAuthCookie = await measureAsync(
    "AUTH cookie check",
    "server",
    () => requestHasSupabaseAuthCookie(),
    { route: options.route },
  );
  if (!hasAuthCookie) {
    logTiming("AUTH getUser", 0, {
      route: options.route,
      operation: "server",
      status: "skipped-no-cookie",
    });
    return null;
  }

  const supabase = await measureAsync(
    "AUTH server client",
    "create server client",
    () => getSupabaseServerClient(),
    { route: options.route },
  );
  const { data, error } = await measureAsync(
    "AUTH getUser",
    "server",
    () => supabase.auth.getUser(),
    { route: options.route },
  );
  if (error || !data.user) return null;
  return data.user;

}

export async function getCurrentUser(
  options: { route?: string } = {},
): Promise<CurrentUser | null> {
  const startedAt = performance.now();
  const authUser = await getCurrentAuthUser(options);
  if (!authUser) {
    logTiming("AUTH current user", performance.now() - startedAt, {
      route: options.route,
      operation: "getUser + profile",
      status: "anonymous",
    });
    return null;
  }
  const profile = await measureAsync(
    "PROFILE query",
    "profile sync",
    () => ensureProfile(authUser),
    { route: options.route },
  );
  logTiming("AUTH current user", performance.now() - startedAt, {
    route: options.route,
    operation: "getUser + profile",
    status: "ok",
  });
  return { authUser, profile };

}
