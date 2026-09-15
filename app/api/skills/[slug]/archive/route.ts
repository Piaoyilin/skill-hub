import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  SkillManagementError,
  archiveOwnedSkill,
} from "@/lib/registry/management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function statusForError(code: string) {
  if (code === "SKILL_NOT_FOUND") return 404;
  if (code === "SKILL_PERMISSION_DENIED") return 403;
  if (code === "SKILL_STATUS_INVALID") return 409;
  if (code === "DATABASE_NOT_CONFIGURED") return 503;
  return 500;
}

export async function POST(_request: Request, context: RouteContext) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "暂时无法验证登录状态，请稍后重试。",
        },
      },
      { status: 503 },
    );
  }

  if (!currentUser) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "请先登录后再下架 Skill。" },
      },
      { status: 401 },
    );
  }

  const { slug } = await context.params;
  try {
    const skill = await archiveOwnedSkill(slug, currentUser.profile.id);
    return NextResponse.json({ success: true, skill });
  } catch (error) {
    if (error instanceof SkillManagementError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: statusForError(error.code) },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SKILL_MANAGEMENT_FAILED",
          message: "Skill 下架失败，请稍后重试。",
        },
      },
      { status: 500 },
    );
  }
}
