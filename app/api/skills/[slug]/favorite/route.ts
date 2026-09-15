import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  favoriteSkill,
  FavoriteError,
  getFavoriteStatusForSlug,
  unfavoriteSkill,
} from "@/lib/registry/favorites";
import { SupabaseConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function statusForError(code: string) {
  if (code === "SKILL_NOT_FOUND") return 404;
  if (code === "DATABASE_NOT_CONFIGURED") return 503;
  return 500;
}

async function authenticate() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AUTH_REQUIRED",
            message: "请先登录后再管理收藏。",
          },
        },
        { status: 401 },
      );
    }

    return currentUser;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            error instanceof SupabaseConfigurationError
              ? "AUTH_NOT_CONFIGURED"
              : "AUTH_UNAVAILABLE",
          message:
            error instanceof SupabaseConfigurationError
              ? "服务端尚未配置 Supabase Auth，暂时无法管理收藏。"
              : "暂时无法验证登录状态，请稍后重试。",
        },
      },
      { status: 503 },
    );
  }
}

function errorResponse(error: unknown) {
  if (error instanceof FavoriteError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      { status: statusForError(error.code) },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "FAVORITE_FAILED",
        message: "收藏操作失败，请稍后重试。",
      },
    },
    { status: 500 },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const authenticated = await authenticate();
  if (authenticated instanceof NextResponse) return authenticated;

  const { slug } = await context.params;

  try {
    const favorited = await getFavoriteStatusForSlug(
      authenticated.profile.id,
      slug,
    );
    return NextResponse.json({ success: true, favorited });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const authenticated = await authenticate();
  if (authenticated instanceof NextResponse) return authenticated;

  const { slug } = await context.params;

  try {
    const result = await favoriteSkill(authenticated.profile.id, slug);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authenticated = await authenticate();
  if (authenticated instanceof NextResponse) return authenticated;

  const { slug } = await context.params;

  try {
    const result = await unfavoriteSkill(authenticated.profile.id, slug);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
