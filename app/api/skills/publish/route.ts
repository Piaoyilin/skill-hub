import { NextResponse } from "next/server";
import {
  publishSkillPackage,
  type PublishSkillFields,
} from "@/lib/registry/publish";
import type { ValidationResult } from "@/lib/skills/types";
import { getCurrentUser } from "@/lib/auth/server";
import { SupabaseConfigurationError } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function textValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : undefined;
}

function tagValues(formData: FormData) {
  return formData
    .getAll("tags")
    .flatMap((value) => (typeof value === "string" ? [value] : []));
}

function statusForError(code: string) {
  if (
    code === "SKILL_VERSION_EXISTS" ||
    code === "SKILL_SLUG_EXISTS" ||
    code === "STORAGE_PATH_EXISTS"
  ) {
    return 409;
  }

  if (code === "SKILL_PERMISSION_DENIED") {
    return 403;
  }

  if (code === "STORAGE_NOT_CONFIGURED") {
    return 503;
  }

  if (code === "AUTH_REQUIRED") {
    return 401;
  }

  if (code === "AUTH_NOT_CONFIGURED" || code === "AUTH_UNAVAILABLE") {
    return 503;
  }

  if (
    code === "CATEGORY_REQUIRED" ||
    code === "CATEGORY_NOT_FOUND" ||
    code === "VERSION_REQUIRED" ||
    code === "VERSION_INVALID" ||
    code === "NAME_INVALID" ||
    code === "DISPLAY_NAME_INVALID" ||
    code === "SLUG_TYPE_INVALID" ||
    code === "SLUG_INVALID" ||
    code === "FILE_TYPE_INVALID" ||
    code === "FILE_EMPTY" ||
    code === "DATABASE_NOT_CONFIGURED"
  ) {
    return code === "DATABASE_NOT_CONFIGURED" ? 503 : 400;
  }

  return 500;
}

function publicValidation(validation: ValidationResult) {
  return {
    valid: validation.valid,
    issues: validation.issues,
  };
}

export async function POST(request: Request) {
  let currentUser;

  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AUTH_NOT_CONFIGURED",
            message: "服务端尚未配置 Supabase Auth，暂时无法发布 Skill。",
          },
        },
        { status: 503 },
      );
    }

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
        error: {
          code: "AUTH_REQUIRED",
          message: "请先登录后再发布 Skill。",
        },
      },
      { status: 401 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MULTIPART_INVALID",
          message: "无法读取上传内容，请使用 multipart/form-data 格式。",
        },
      },
      { status: 400 },
    );
  }

  const entry = formData.get("file");
  if (!isFileLike(entry)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FILE_MISSING",
          message: "请选择要发布的 ZIP 文件。",
        },
      },
      { status: 400 },
    );
  }

  const fields: PublishSkillFields = {
    category: textValue(formData.get("category")),
    version: textValue(formData.get("version")),
    tags: tagValues(formData),
  };
  const slug = textValue(formData.get("slug"));
  const displayName = textValue(formData.get("displayName"));
  const description = textValue(formData.get("description"));
  const targetSlug = textValue(formData.get("targetSlug"));
  if (slug !== undefined) fields.slug = slug;
  if (displayName !== undefined) fields.displayName = displayName;
  if (description !== undefined) fields.description = description;
  if (targetSlug !== undefined) fields.targetSlug = targetSlug;

  try {
    const result = await publishSkillPackage(
      {
        buffer: new Uint8Array(await entry.arrayBuffer()),
        fileName: entry.name,
      },
      fields,
      {
        owner: {
          id: currentUser.profile.id,
          username: currentUser.profile.username,
          displayName: currentUser.profile.displayName,
        },
      },
    );

    if (result.kind === "success") {
      return NextResponse.json({
        success: true,
        skill: result.skill,
        validation: publicValidation(result.validation),
        warnings: result.warnings,
      });
    }

    if (result.kind === "validation-error") {
      return NextResponse.json(
        {
          success: false,
          validation: publicValidation(result.validation),
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: result.error,
      },
      { status: statusForError(result.error.code) },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "PUBLISH_FAILED",
          message: "Skill 发布失败，请稍后重试。",
        },
      },
      { status: 500 },
    );
  }
}
