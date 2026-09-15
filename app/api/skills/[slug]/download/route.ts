import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { downloadSkillPackage } from "@/lib/registry/download";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadRouteContext = {
  params: Promise<{ slug: string }>;
};

function statusForError(code: string) {
  if (code === "SKILL_NOT_FOUND" || code === "SKILL_VERSION_NOT_FOUND") {
    return 404;
  }

  if (
    code === "PACKAGE_NOT_AVAILABLE" ||
    code === "STORAGE_OBJECT_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    code === "SLUG_INVALID" ||
    code === "VERSION_INVALID" ||
    code === "STORAGE_PATH_INVALID"
  ) {
    return 400;
  }

  if (code === "DATABASE_NOT_CONFIGURED" || code === "STORAGE_NOT_CONFIGURED") {
    return 503;
  }

  return 500;
}

export async function GET(request: Request, context: DownloadRouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const version = url.searchParams.get("version") ?? undefined;
  let viewerId: string | undefined;

  try {
    viewerId = (await getCurrentUser())?.profile.id;
  } catch {
    viewerId = undefined;
  }

  try {
    const result = await downloadSkillPackage(slug, { version, viewerId });

    if (result.kind === "error") {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: statusForError(result.error.code) },
      );
    }

    return new Response(Buffer.from(result.content), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(result.content.byteLength),
        "X-Skill-Version": result.version,
        "X-Skill-Package-Hash": result.packageHash ?? "",
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOWNLOAD_FAILED",
          message: "下载技能包失败，请稍后重试。",
        },
      },
      { status: 500 },
    );
  }
}
