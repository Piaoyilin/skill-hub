import { NextResponse } from "next/server";
import { analyzeSkillUpload } from "@/lib/skills/upload";

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

function jsonError(
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
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError(
      400,
      "MULTIPART_INVALID",
      "无法读取上传内容，请使用 multipart/form-data 格式。",
    );
  }

  const entry = formData.get("file");
  if (!isFileLike(entry)) {
    return jsonError(400, "FILE_MISSING", "请选择要上传的 ZIP 文件。");
  }

  try {
    const analysis = await analyzeSkillUpload({
      buffer: new Uint8Array(await entry.arrayBuffer()),
      fileName: entry.name,
    });

    if (analysis.kind === "preview") {
      return NextResponse.json({
        success: true,
        ...analysis.preview,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: analysis.error,
        ...(analysis.preview ?? {}),
      },
      { status: analysis.preview ? 422 : 400 },
    );
  } catch {
    return jsonError(
      500,
      "UPLOAD_ANALYSIS_FAILED",
      "服务器分析技能包时发生错误，请稍后重试。",
    );
  }
}
