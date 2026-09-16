import { NextResponse } from "next/server";
import {
  importGithubSkill,
  type GithubImportErrorCode,
} from "@/lib/skills/github-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusForError(code: GithubImportErrorCode) {
  switch (code) {
    case "URL_INVALID":
    case "UNSUPPORTED_HOST":
      return 400;
    case "REPOSITORY_NOT_FOUND":
      return 404;
    case "PRIVATE_REPOSITORY":
    case "ACCESS_DENIED":
      return 403;
    case "SKILL_MD_NOT_FOUND":
    case "VALIDATION_FAILED":
      return 422;
    case "PACKAGE_TOO_LARGE":
      return 413;
    case "GITHUB_RATE_LIMIT":
      return 429;
    case "FETCH_FAILED":
      return 502;
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      ...extra,
    },
    { status },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "URL_INVALID",
      "请输入有效的 GitHub Repository URL",
    );
  }

  const url =
    body && typeof body === "object" && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;
  if (typeof url !== "string") {
    return errorResponse(
      400,
      "URL_INVALID",
      "请输入有效的 GitHub Repository URL",
    );
  }

  try {
    const result = await importGithubSkill(url);

    if (result.kind === "success") {
      return NextResponse.json({
        success: true,
        repository: result.repository,
        fileName: result.fileName,
        packageBase64: result.packageBase64,
        ...result.preview,
      });
    }

    if (result.kind === "validation-error") {
      return errorResponse(
        422,
        result.error.code,
        result.error.message,
        {
          repository: result.repository,
          ...result.preview,
        },
      );
    }

    return errorResponse(
      statusForError(result.error.code),
      result.error.code,
      result.error.message,
    );
  } catch {
    return errorResponse(
      502,
      "FETCH_FAILED",
      "无法读取 GitHub 仓库，请稍后重试",
    );
  }
}
