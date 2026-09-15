"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Github,
  Loader2,
  RotateCcw,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryView } from "@/lib/registry";
import type { SkillUploadPreview } from "@/lib/skills/upload";

type CreateMode = "blank" | "github" | "upload";
type UploadState =
  | "idle"
  | "uploading"
  | "preview-ready"
  | "validation-error"
  | "publishing"
  | "publish-success"
  | "publish-error"
  | "upload-error";
type CheckStatus = "pass" | "warning" | "error";

type UploadResponse = {
  success: boolean;
  error?: { code: string; message: string };
  skill?: SkillUploadPreview["skill"];
  files?: SkillUploadPreview["files"];
  scripts?: SkillUploadPreview["scripts"];
  references?: SkillUploadPreview["references"];
  assets?: SkillUploadPreview["assets"];
  validation?: SkillUploadPreview["validation"];
};

type PublishResponse = {
  success: boolean;
  error?: { code: string; message: string };
  validation?: SkillUploadPreview["validation"];
  skill?: {
    id: string;
    slug: string;
    version: string;
    url: string;
  };
};

const specificationChecks = [
  {
    label: "找到 SKILL.md",
    codes: [
      "SKILL_MD_MISSING",
      "SKILL_MD_CONTENT_MISSING",
      "SKILL_MD_PATH_INVALID",
      "SKILL_MD_NOT_AT_ROOT",
    ],
  },
  {
    label: "YAML 格式正确",
    codes: [
      "SKILL_MD_MISSING",
      "SKILL_MD_CONTENT_MISSING",
      "FRONTMATTER_MISSING",
      "FRONTMATTER_NOT_OBJECT",
      "YAML_INVALID",
      "SKILL_MD_PARSE_FAILED",
    ],
  },
  {
    label: "name 存在",
    codes: [
      "SKILL_MD_MISSING",
      "SKILL_MD_CONTENT_MISSING",
      "NAME_MISSING",
      "NAME_EMPTY",
      "NAME_TYPE_INVALID",
    ],
  },
  {
    label: "description 存在",
    codes: [
      "SKILL_MD_MISSING",
      "SKILL_MD_CONTENT_MISSING",
      "DESCRIPTION_MISSING",
      "DESCRIPTION_EMPTY",
      "DESCRIPTION_TYPE_INVALID",
    ],
  },
] as const;

const securityChecks = [
  {
    label: "未检测到路径穿越",
    codes: [
      "PATH_TRAVERSAL",
      "ABSOLUTE_PATH",
      "WINDOWS_DRIVE_PATH",
      "INVALID_PATH",
      "DUPLICATE_PATH",
    ],
  },
  {
    label: "未检测到危险文件",
    codes: ["DANGEROUS_EXTENSION", "INVALID_FILENAME", "SYMLINK_REJECTED"],
  },
  {
    label: "脚本文件",
    codes: ["SCRIPT_FILE_PRESENT"],
  },
  {
    label: "隐藏文件",
    codes: ["HIDDEN_FILE"],
  },
] as const;

function findIssue(
  validation: SkillUploadPreview["validation"] | undefined,
  codes: readonly string[],
) {
  return validation?.issues.find((issue) => codes.includes(issue.code));
}

function getCheckStatus(
  validation: SkillUploadPreview["validation"] | undefined,
  codes: readonly string[],
): CheckStatus {
  const issue = findIssue(validation, codes);
  if (!issue) return "pass";
  return issue.severity === "warning" ? "warning" : "error";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return (
      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
    );
  }

  if (status === "warning") {
    return (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
    );
  }

  return <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
}

function checkMessage(
  validation: SkillUploadPreview["validation"] | undefined,
  codes: readonly string[],
) {
  return findIssue(validation, codes)?.message;
}

function issueLabel(severity: "error" | "warning" | "info") {
  if (severity === "error") return "错误";
  if (severity === "warning") return "警告";
  return "提示";
}

function formatBytes(bytes: number | undefined) {
  if (bytes === undefined) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function PreviewPanel({
  preview,
  state,
  errorMessage,
  categories,
  category,
  version,
  tags,
  onCategoryChange,
  onVersionChange,
  onTagsChange,
  onPublish,
  onReset,
  publishedSkill,
}: {
  preview: SkillUploadPreview | null;
  state: UploadState;
  errorMessage: string;
  categories: CategoryView[];
  category: string;
  version: string;
  tags: string;
  onCategoryChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onPublish: () => void;
  onReset: () => void;
  publishedSkill: { slug: string; version: string } | null;
}) {
  if (state === "uploading") {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在分析技能包
      </div>
    );
  }

  if (state === "upload-error" && !preview) {
    return (
      <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
        {errorMessage || "上传失败，请重新选择文件。"}
      </div>
    );
  }

  if (!preview) return null;

  const validation = preview.validation;
  const fileCount = preview.files.filter((file) => file.type === "file").length;

  return (
    <div className="mt-5 space-y-5 rounded-md border bg-muted/20 p-4">
      {(state === "publish-error" || state === "validation-error") &&
      errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
          {errorMessage.includes("请先登录") ? (
            <Link
              href="/login?next=/create"
              className="ml-2 font-medium underline underline-offset-2"
            >
              去登录
            </Link>
          ) : null}
        </div>
      ) : null}

      {state === "publish-success" ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check className="h-4 w-4" />
          <span>发布成功</span>
        </div>
      ) : null}

      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Skill 预览
            </p>
            <h3 className="mt-1 truncate font-semibold">
              {preview.skill?.name?.trim() || "未解析到 Skill"}
            </h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {preview.skill?.version
              ? `v${preview.skill.version}`
              : "未指定版本"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {preview.skill?.description?.trim() || "暂时无法读取技能描述。"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">文件数量</p>
          <p className="mt-1 font-semibold text-foreground">{fileCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">scripts</p>
          <p className="mt-1 font-semibold text-foreground">
            {preview.scripts.length}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">references</p>
          <p className="mt-1 font-semibold text-foreground">
            {preview.references.length}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">assets</p>
          <p className="mt-1 font-semibold text-foreground">
            {preview.assets.length}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">规范检查</p>
        <div className="mt-3 space-y-2">
          {specificationChecks.map((check) => {
            const status = getCheckStatus(validation, check.codes);
            const message = checkMessage(validation, check.codes);

            return (
              <div key={check.label} className="flex items-start gap-2 text-xs">
                <StatusIcon status={status} />
                <div className="min-w-0">
                  <p className="text-foreground">{check.label}</p>
                  {message ? (
                    <p className="mt-0.5 text-muted-foreground">{message}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">安全检查</p>
        <div className="mt-3 space-y-2">
          {securityChecks.map((check) => {
            const status = getCheckStatus(validation, check.codes);
            const message = checkMessage(validation, check.codes);

            return (
              <div key={check.label} className="flex items-start gap-2 text-xs">
                <StatusIcon status={status} />
                <div className="min-w-0">
                  <p className="text-foreground">
                    {check.label}
                    {check.label === "脚本文件" && status === "warning"
                      ? "：Skill Hub 不会执行用户上传的脚本"
                      : ""}
                  </p>
                  {message ? (
                    <p className="mt-0.5 text-muted-foreground">{message}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p
        className={
          validation.valid
            ? "text-xs text-emerald-700 dark:text-emerald-400"
            : "text-xs text-red-700 dark:text-red-400"
        }
      >
        {validation.valid
          ? "未发现严重问题，可以继续检查。"
          : "发现需要修正的问题，请根据上方检查结果处理。"}
      </p>

      {validation.issues.length > 0 ? (
        <div>
          <p className="text-sm font-medium">检查详情</p>
          <div className="mt-3 space-y-2">
            {validation.issues.map((issue, index) => (
              <div
                key={`${issue.code}-${issue.path ?? "package"}-${index}`}
                className="text-xs leading-5"
              >
                <span className="font-medium text-foreground">
                  {issueLabel(issue.severity)} · {issue.code}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {issue.path ? `${issue.path}：` : ""}
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-medium">文件清单</p>
        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded border bg-background p-2">
          {preview.files.map((file, index) => (
            <div
              key={`${file.path}-${file.type}-${index}`}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {file.path}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {file.type === "directory"
                  ? "目录"
                  : formatBytes(file.sizeBytes)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {state !== "publish-success" ? (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">发布信息</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs">
              <span className="text-muted-foreground">分类</span>
              <select
                value={category}
                onChange={(event) => onCategoryChange(event.target.value)}
                disabled={state === "publishing"}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">请选择分类</option>
                {categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs">
              <span className="text-muted-foreground">版本</span>
              <Input
                value={version}
                onChange={(event) => onVersionChange(event.target.value)}
                placeholder="例如 1.0.0"
                disabled={state === "publishing"}
                aria-label="版本"
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-xs">
            <span className="text-muted-foreground">标签</span>
            <Input
              value={tags}
              onChange={(event) => onTagsChange(event.target.value)}
              placeholder="多个标签用逗号分隔，可选"
              disabled={state === "publishing"}
              aria-label="标签"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={onPublish}
              disabled={state === "publishing" || !preview.validation.valid}
            >
              {state === "publishing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {state === "publishing" ? "正在发布" : "发布技能"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={state === "publishing"}
            >
              <RotateCcw className="h-4 w-4" />
              重新选择
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {state === "publish-success" && publishedSkill ? (
            <Button asChild type="button">
              <Link href={`/skills/${publishedSkill.slug}`}>
                查看技能
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw className="h-4 w-4" />
            继续创建
          </Button>
        </div>
      )}
    </div>
  );
}

export function CreateOptions({
  mode,
  categories = [],
}: {
  mode: CreateMode;
  categories?: CategoryView[];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadPreview, setUploadPreview] =
    useState<SkillUploadPreview | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadFileSource, setUploadFileSource] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [version, setVersion] = useState("");
  const [tags, setTags] = useState("");
  const [publishedSkill, setPublishedSkill] = useState<{
    slug: string;
    version: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    setOpen((current) => !current);
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      mode === "github"
        ? "已准备导入，下一步将检查仓库中的 SKILL.md。"
        : "模板已准备好，下一步将进入编辑器。",
    );
  }

  async function uploadFile(file: File) {
    setUploadState("uploading");
    setUploadPreview(null);
    setUploadError("");
    setUploadFileSource(file);
    setPublishedSkill(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/skills/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as UploadResponse;

      if (
        payload.validation &&
        payload.files &&
        payload.scripts &&
        payload.references &&
        payload.assets
      ) {
        const preview: SkillUploadPreview = {
          skill: payload.skill ?? null,
          files: payload.files,
          scripts: payload.scripts,
          references: payload.references,
          assets: payload.assets,
          validation: payload.validation,
        };

        setUploadPreview(preview);
        setUploadState(
          preview.validation.valid ? "preview-ready" : "validation-error",
        );
        setUploadError(payload.error?.message ?? "");
        setVersion(preview.skill?.version ?? "");
        return;
      }

      setUploadState("upload-error");
      setUploadError(payload.error?.message ?? "上传失败，请重新选择文件。");
    } catch {
      setUploadState("upload-error");
      setUploadError("无法连接上传服务，请稍后重试。");
    }
  }

  async function publishFile() {
    if (!uploadFileSource || !uploadPreview || !uploadPreview.validation.valid) {
      return;
    }

    setUploadState("publishing");
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", uploadFileSource);
      if (category) formData.append("category", category);
      if (version.trim()) formData.append("version", version.trim());
      if (tags.trim()) formData.append("tags", tags);

      const response = await fetch("/api/skills/publish", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as PublishResponse;

      if (payload.success && payload.skill) {
        setPublishedSkill({
          slug: payload.skill.slug,
          version: payload.skill.version,
        });
        setUploadState("publish-success");
        setUploadError("");
        return;
      }

      if (payload.validation) {
        setUploadPreview((current) =>
          current ? { ...current, validation: payload.validation! } : current,
        );
      }
      setUploadState("publish-error");
      setUploadError(
        payload.error?.message || "发布未完成，请根据检查结果处理后重试。",
      );
    } catch {
      setUploadState("publish-error");
      setUploadError("无法连接发布服务，请稍后重试。");
    }
  }

  function resetUpload() {
    setUploadState("idle");
    setUploadPreview(null);
    setUploadError("");
    setUploadFileSource(null);
    setPublishedSkill(null);
    setCategory("");
    setVersion("");
    setTags("");
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void uploadFile(file);
  }

  if (mode === "upload") {
    return (
      <div className="mt-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploadState === "uploading" || uploadState === "publishing"}
          onClick={() => {
            if (uploadState !== "uploading" && uploadState !== "publishing") {
              fileInputRef.current?.click();
            }
          }}
        >
          {uploadState === "uploading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploadState === "uploading"
            ? "正在分析技能包"
            : uploadPreview
              ? "重新选择文件"
              : "上传技能包"}
        </Button>
        <PreviewPanel
          preview={uploadPreview}
          state={uploadState}
          errorMessage={uploadError}
          categories={categories}
          category={category}
          version={version}
          tags={tags}
          onCategoryChange={setCategory}
          onVersionChange={setVersion}
          onTagsChange={setTags}
          onPublish={() => void publishFile()}
          onReset={resetUpload}
          publishedSkill={publishedSkill}
        />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <Button
        type="button"
        variant={mode === "github" ? "outline" : "default"}
        onClick={toggle}
      >
        {mode === "github" ? <Github className="h-4 w-4" /> : null}
        {open ? "收起" : mode === "github" ? "导入仓库" : "开始创建"}
      </Button>
      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === "github" ? (
            <Input
              required
              placeholder="https://github.com/组织/仓库"
              aria-label="GitHub 仓库地址"
            />
          ) : (
            <Input required placeholder="Skill 名称" aria-label="Skill 名称" />
          )}
          <Button type="submit" size="sm">
            {mode === "github" ? "检查仓库" : "使用模板创建"}
          </Button>
          {message ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
