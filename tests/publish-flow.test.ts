import { describe, expect, it } from "vitest";
import {
  buildPublishConfirmation,
  buildPublishRequest,
  canStartPublish,
  canContinueValidation,
  getDefaultPublishDetails,
  getPublishDetailsError,
  getPublishSuccessLinks,
  isValidatedFileCurrent,
  publishErrorMessage,
} from "../components/create-options";
import type { SkillUploadPreview } from "../lib/skills/upload";

function preview(valid: boolean): SkillUploadPreview {
  return {
    skill: {
      name: "Demo Skill",
      displayName: "Demo Display",
      slug: "demo-skill",
      description: "用于测试发布向导",
      version: "1.2.3",
      category: "前端",
    },
    packageSizeBytes: 128,
    skillMdPreview: "---\nname: Demo Skill\n---\n",
    files: [
      { path: "SKILL.md", type: "file", sizeBytes: 80 },
      { path: "scripts", type: "directory" },
      { path: "scripts/check.sh", type: "file", sizeBytes: 10 },
    ],
    scripts: [{ path: "scripts/check.sh", type: "file", sizeBytes: 10 }],
    references: [],
    assets: [],
    validation: {
      valid,
      issues: valid
        ? [{ severity: "warning", code: "SCRIPT_FILE_PRESENT", message: "包含脚本" }]
        : [{ severity: "error", code: "SKILL_MD_MISSING", message: "缺少 SKILL.md" }],
    },
  };
}

describe("发布向导纯逻辑", () => {
  it("blocks validation errors but allows warnings", () => {
    expect(canContinueValidation(preview(false))).toBe(false);
    expect(canContinueValidation(preview(true))).toBe(true);
  });

  it("uses parsed defaults and locks the owner target slug", () => {
    const result = getDefaultPublishDetails(preview(true), [{ name: "前端", count: 1 }], {
      slug: "owned-skill",
      name: "Owned Skill",
      authorized: true,
    });

    expect(result).toMatchObject({
      displayName: "Demo Display",
      slug: "owned-skill",
      category: "前端",
      version: "1.2.3",
    });
  });

  it("builds the confirmation summary from the same selected file", () => {
    const file = { name: "demo.zip", size: 256 } as File;
    const details = {
      displayName: "Demo Display",
      slug: "demo-skill",
      description: "描述",
      category: "前端",
      version: "1.2.3",
      tags: "React",
    };

    expect(buildPublishConfirmation(details, file, preview(true))).toMatchObject({
      fileName: "demo.zip",
      fileSize: 256,
      fileCount: 2,
      packageSizeBytes: 128,
    });
    expect(isValidatedFileCurrent(file, file)).toBe(true);
    expect(isValidatedFileCurrent(file, { name: "other.zip", size: 256 } as File)).toBe(false);
  });

  it("blocks duplicate publish requests and sends the validated File object", () => {
    const file = new File(["zip"], "demo.zip", { type: "application/zip" });
    const details = {
      displayName: "Demo Display",
      slug: "demo-skill",
      description: "描述",
      category: "前端",
      version: "1.2.3",
      tags: "React",
    };

    expect(
      canStartPublish({
        publishing: false,
        file,
        preview: preview(true),
        validatedFile: file,
      }),
    ).toBe(true);
    expect(
      canStartPublish({
        publishing: true,
        file,
        preview: preview(true),
        validatedFile: file,
      }),
    ).toBe(false);

    const request = buildPublishRequest(file, details, "demo-skill");
    expect(request.get("file")).toBe(file);
    expect(request.get("targetSlug")).toBe("demo-skill");
  });

  it("validates edited publish details before showing confirmation", () => {
    const details = {
      displayName: "Demo Display",
      slug: "demo-skill",
      description: "描述",
      category: "前端",
      version: "1.2.3",
      tags: "React",
    };

    expect(getPublishDetailsError(details)).toBe("");
    expect(getPublishDetailsError({ ...details, version: "1.0" })).toBe(
      "请填写有效的 SemVer 版本号，例如 1.0.0。",
    );
    expect(getPublishDetailsError({ ...details, slug: "Demo Skill" })).toBe(
      "技能标识格式无效，请使用小写字母、数字和连字符。",
    );
    expect(
      getPublishDetailsError({ ...details, displayName: "line\nbreak" }),
    ).toBe("Skill 名称无效，请检查名称长度和换行字符。");
  });

  it("builds the success destinations", () => {
    expect(getPublishSuccessLinks("demo-skill")).toEqual({
      skill: "/skills/demo-skill",
      management: "/dashboard/skills/demo-skill",
    });
  });

  it("maps server errors to Chinese user-facing messages", () => {
    expect(publishErrorMessage("AUTH_REQUIRED")).toBe("登录后才能发布 Skill。");
    expect(publishErrorMessage("SKILL_PERMISSION_DENIED")).toBe(
      "你没有权限为这个 Skill 发布新版本。",
    );
    expect(publishErrorMessage("SKILL_VERSION_EXISTS")).toBe(
      "该版本已经存在，请修改版本号后重试。",
    );
    expect(publishErrorMessage("PUBLISH_FAILED")).toBe("发布失败，请稍后重试。");
  });
});
