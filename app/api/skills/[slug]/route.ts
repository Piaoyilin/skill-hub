import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  SkillManagementError,
  updateOwnedSkill,
} from "@/lib/registry/management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function statusForError(code: string) {
  if (code === "SKILL_NOT_FOUND") return 404;
  if (code === "SKILL_PERMISSION_DENIED") return 403;
  if (code === "DATABASE_NOT_CONFIGURED") return 503;
  if (
    code === "SKILL_UPDATE_INVALID" ||
    code === "CATEGORY_NOT_FOUND"
  ) {
    return 400;
  }
  return 500;
}

export async function PATCH(request: Request, context: RouteContext) {
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
        error: { code: "AUTH_REQUIRED", message: "请先登录后再管理 Skill。" },
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "REQUEST_INVALID", message: "请求内容格式无效。" },
      },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "REQUEST_INVALID", message: "请求内容格式无效。" },
      },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const allowed = ["displayName", "description", "category", "tags"];
  const hasUnknownField = Object.keys(input).some(
    (key) => !allowed.includes(key),
  );
  if (hasUnknownField) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SKILL_UPDATE_INVALID",
          message: "请求包含不允许修改的字段。",
        },
      },
      { status: 400 },
    );
  }

  const invalidType = Object.entries(input).some(([key, value]) => {
    if (key === "tags") {
      return !Array.isArray(value) || value.some((item) => typeof item !== "string");
    }
    return typeof value !== "string";
  });
  if (invalidType) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SKILL_UPDATE_INVALID",
          message: "展示名称、描述、分类和标签必须使用正确的格式。",
        },
      },
      { status: 400 },
    );
  }

  const { slug } = await context.params;
  try {
    const skill = await updateOwnedSkill(
      slug,
      currentUser.profile.id,
      input as {
        displayName?: string;
        description?: string;
        category?: string;
        tags?: string[];
      },
    );

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
          message: "Skill 更新失败，请稍后重试。",
        },
      },
      { status: 500 },
    );
  }
}
