"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
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
type WizardStep = "upload" | "validation" | "details" | "confirm" | "publishing" | "success";
type CheckStatus = "pass" | "warning" | "error";

export type PublishTarget = {
  slug: string;
  name: string;
  authorized: boolean;
  authenticated?: boolean;
};

type UploadResponse = {
  success: boolean;
  error?: { code: string; message: string };
  repository?: GithubRepositoryInfo;
  fileName?: string;
  packageBase64?: string;
  skill?: SkillUploadPreview["skill"];
  packageSizeBytes?: number;
  skillMdPreview?: string;
  files?: SkillUploadPreview["files"];
  scripts?: SkillUploadPreview["scripts"];
  references?: SkillUploadPreview["references"];
  assets?: SkillUploadPreview["assets"];
  validation?: SkillUploadPreview["validation"];
};

type GithubRepositoryInfo = {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  defaultBranch: string;
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

export type PublishDetails = {
  displayName: string;
  slug: string;
  description: string;
  category: string;
  version: string;
  tags: string;
};

export type PublishConfirmation = PublishDetails & {
  fileName: string;
  fileSize: number | undefined;
  fileCount: number;
  packageSizeBytes: number | undefined;
};

const steps: Array<{ id: Exclude<WizardStep, "publishing" | "success">; label: string }> = [
  { id: "upload", label: "上传" },
  { id: "validation", label: "验证" },
  { id: "details", label: "发布信息" },
  { id: "confirm", label: "确认" },
];

const specificationChecks = [
  {
    label: "找到 SKILL.md",
    codes: ["SKILL_MD_MISSING", "SKILL_MD_CONTENT_MISSING", "SKILL_MD_PATH_INVALID", "SKILL_MD_NOT_AT_ROOT"],
  },
  {
    label: "YAML 格式正确",
    codes: ["FRONTMATTER_MISSING", "FRONTMATTER_NOT_OBJECT", "YAML_INVALID", "SKILL_MD_PARSE_FAILED"],
  },
  {
    label: "name 存在",
    codes: ["NAME_MISSING", "NAME_EMPTY", "NAME_TYPE_INVALID"],
  },
  {
    label: "description 存在",
    codes: ["DESCRIPTION_MISSING", "DESCRIPTION_EMPTY", "DESCRIPTION_TYPE_INVALID"],
  },
] as const;

const securityChecks = [
  {
    label: "未检测到路径安全问题",
    codes: ["PATH_TRAVERSAL", "ABSOLUTE_PATH", "WINDOWS_DRIVE_PATH", "INVALID_PATH", "DUPLICATE_PATH"],
  },
  {
    label: "未检测到危险文件",
    codes: ["DANGEROUS_EXTENSION", "INVALID_FILENAME", "SYMLINK_REJECTED"],
  },
  { label: "脚本文件", codes: ["SCRIPT_FILE_PRESENT"] },
  { label: "隐藏文件", codes: ["HIDDEN_FILE"] },
] as const;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;
const MAX_DISPLAY_NAME_LENGTH = 200;

const detailValidationCodes = new Set([
  "DISPLAY_NAME_INVALID",
  "SLUG_INVALID",
  "SLUG_TYPE_INVALID",
  "VERSION_INVALID",
  "VERSION_REQUIRED",
]);

function findIssue(
  validation: SkillUploadPreview["validation"] | undefined,
  codes: readonly string[],
) {
  return validation?.issues.find((issue) => codes.includes(issue.code));
}

function checkStatus(
  validation: SkillUploadPreview["validation"] | undefined,
  codes: readonly string[],
): CheckStatus {
  const issue = findIssue(validation, codes);
  if (!issue) return "pass";
  return issue.severity === "warning" ? "warning" : "error";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  }
  return <X className="h-4 w-4 text-red-600 dark:text-red-400" />;
}

function formatBytes(bytes: number | undefined) {
  if (bytes === undefined) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function issueLabel(severity: "error" | "warning" | "info") {
  if (severity === "error") return "错误";
  if (severity === "warning") return "警告";
  return "提示";
}

export function publishErrorMessage(code?: string, fallback?: string) {
  switch (code) {
    case "AUTH_REQUIRED":
      return "登录后才能发布 Skill。";
    case "SKILL_PERMISSION_DENIED":
      return "你没有权限为这个 Skill 发布新版本。";
    case "SKILL_VERSION_EXISTS":
    case "VERSION_CONFLICT":
      return "该版本已经存在，请修改版本号后重试。";
    case "CATEGORY_REQUIRED":
    case "CATEGORY_NOT_FOUND":
      return "请选择一个有效分类后重试。";
    case "VERSION_REQUIRED":
    case "VERSION_INVALID":
      return "请填写有效的 SemVer 版本号，例如 1.0.0。";
    case "SLUG_INVALID":
    case "SLUG_TYPE_INVALID":
      return "技能标识格式无效，请使用小写字母、数字和连字符。";
    case "DISPLAY_NAME_INVALID":
    case "NAME_INVALID":
      return "Skill 名称无效，请检查名称长度和换行字符。";
    case "VALIDATION_FAILED":
    case "ZIP_INVALID":
      return "Skill 验证未通过，请修复问题后重试。";
    case "STORAGE_NOT_CONFIGURED":
    case "STORAGE_PATH_EXISTS":
    case "STORAGE_UPLOAD_FAILED":
    case "PUBLISH_COMPENSATION_FAILED":
    case "DATABASE_NOT_CONFIGURED":
    case "DATABASE_PREFLIGHT_FAILED":
    case "PUBLISH_FAILED":
      return "发布失败，请稍后重试。";
    default:
      return "发布失败，请稍后重试。";
  }
}

export function getPublishDetailsError(details: PublishDetails) {
  if (!details.category.trim()) {
    return "请选择一个分类。";
  }

  if (!details.version.trim()) {
    return "请填写版本号。";
  }

  if (!SEMVER_PATTERN.test(details.version.trim())) {
    return "请填写有效的 SemVer 版本号，例如 1.0.0。";
  }

  const displayName = details.displayName.trim();
  if (
    !displayName ||
    displayName.length > MAX_DISPLAY_NAME_LENGTH ||
    /[\r\n]/.test(displayName)
  ) {
    return "Skill 名称无效，请检查名称长度和换行字符。";
  }

  const slug = details.slug.trim();
  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    return "技能标识格式无效，请使用小写字母、数字和连字符。";
  }

  return "";
}

function isPublishDetailsValidationCode(code: string) {
  return detailValidationCodes.has(code);
}

export function canContinueValidation(preview: SkillUploadPreview | null) {
  return Boolean(preview?.validation.valid);
}

export function getDefaultPublishDetails(
  preview: SkillUploadPreview,
  categories: CategoryView[],
  publishTarget?: PublishTarget | null,
): PublishDetails {
  const value = preview.skill?.category?.trim();
  return {
    displayName: preview.skill?.displayName || preview.skill?.name || "",
    slug: publishTarget?.authorized
      ? publishTarget.slug
      : preview.skill?.slug || "",
    description: preview.skill?.description || "",
    category: value && categories.some((category) => category.name === value) ? value : "",
    version: preview.skill?.version || "",
    tags: "",
  };
}

export function buildPublishConfirmation(
  details: PublishDetails,
  file: Pick<File, "name" | "size"> | null,
  preview: SkillUploadPreview,
): PublishConfirmation {
  return {
    ...details,
    fileName: file?.name || "未选择",
    fileSize: file?.size,
    fileCount: preview.files.filter((item) => item.type === "file").length,
    packageSizeBytes: preview.packageSizeBytes,
  };
}

export function isValidatedFileCurrent(
  file: File | null,
  validatedFile: File | null,
) {
  return Boolean(file && validatedFile && file === validatedFile);
}

export function canStartPublish(input: {
  publishing: boolean;
  file: File | null;
  preview: SkillUploadPreview | null;
  validatedFile: File | null;
}) {
  return (
    !input.publishing &&
    Boolean(input.file) &&
    Boolean(input.preview) &&
    canContinueValidation(input.preview) &&
    isValidatedFileCurrent(input.file, input.validatedFile)
  );
}

export function buildPublishRequest(
  file: File,
  details: PublishDetails,
  targetSlug?: string,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", details.category);
  formData.append("version", details.version.trim());
  formData.append("slug", details.slug.trim());
  formData.append("displayName", details.displayName.trim());
  formData.append("description", details.description.trim());
  if (targetSlug) formData.append("targetSlug", targetSlug);
  if (details.tags.trim()) formData.append("tags", details.tags.trim());
  return formData;
}

export function getPublishSuccessLinks(slug: string) {
  return {
    skill: `/skills/${slug}`,
    management: `/dashboard/skills/${slug}`,
  };
}

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex =
    current === "publishing" || current === "success"
      ? steps.length
      : steps.findIndex((step) => step.id === current);

  return (
    <ol className="grid grid-cols-4 gap-2 border-b pb-5">
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.id} className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                  complete || active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`truncate text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ValidationSummary({ preview }: { preview: SkillUploadPreview }) {
  const errors = preview.validation.issues.filter((issue) => issue.severity === "error");
  const warnings = preview.validation.issues.filter((issue) => issue.severity === "warning");
  const fileCount = preview.files.filter((file) => file.type === "file").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <SummaryItem label="文件数量" value={String(fileCount)} />
        <SummaryItem label="包大小" value={formatBytes(preview.packageSizeBytes)} />
        <SummaryItem label="scripts" value={String(preview.scripts.length)} />
        <SummaryItem label="references" value={String(preview.references.length)} />
        <SummaryItem label="assets" value={String(preview.assets.length)} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <CheckGroup title="规范检查" checks={specificationChecks} preview={preview} />
        <CheckGroup title="安全检查" checks={securityChecks} preview={preview} />
      </div>

      <div
        className={`rounded-md border p-3 text-sm ${
          preview.validation.valid
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        }`}
      >
        {preview.validation.valid
          ? warnings.length > 0
            ? `验证通过，但有 ${warnings.length} 条警告，可以继续发布。`
            : "验证通过，可以继续发布。"
          : `验证未通过，请修复 ${errors.length} 条错误后重新上传。`}
      </div>

      {preview.validation.issues.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Validation / Security 结果</h3>
          <div className="mt-3 space-y-2">
            {preview.validation.issues.map((issue, index) => (
              <div key={`${issue.code}-${issue.path ?? "package"}-${index}`} className="text-xs leading-5">
                <span className="font-medium text-foreground">
                  {issueLabel(issue.severity)} · {issue.code}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {issue.path ? `${issue.path}：` : ""}
                  {issue.message}
                  {issue.code === "SCRIPT_FILE_PRESENT" ? " Skill Hub 不会执行其中的脚本。" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckGroup({
  title,
  checks,
  preview,
}: {
  title: string;
  checks: readonly { label: string; codes: readonly string[] }[];
  preview: SkillUploadPreview;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-3 space-y-2">
        {checks.map((check) => {
          const status = checkStatus(preview.validation, check.codes);
          const message = findIssue(preview.validation, check.codes)?.message;
          return (
            <div key={check.label} className="flex items-start gap-2 text-xs">
              <StatusIcon status={status} />
              <div className="min-w-0">
                <p className="text-foreground">{check.label}</p>
                {message ? <p className="mt-0.5 text-muted-foreground">{message}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function CreateOptions({
  mode,
  categories = [],
  publishTarget = null,
}: {
  mode: CreateMode;
  categories?: CategoryView[];
  publishTarget?: PublishTarget | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<WizardStep>("upload");
  const [preview, setPreview] = useState<SkillUploadPreview | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [fileSource, setFileSource] = useState<File | null>(null);
  const [validatedFile, setValidatedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [version, setVersion] = useState("");
  const [tags, setTags] = useState("");
  const [publishedSkill, setPublishedSkill] = useState<{ slug: string; version: string } | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [repository, setRepository] = useState<GithubRepositoryInfo | null>(null);
  const uploadRequestRef = useRef(0);
  const publishingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    setOpen((current) => !current);
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "github") {
      void importGithub(githubUrl);
      return;
    }
    setMessage(
      "模板已准备好，下一步将进入编辑器。",
    );
  }

  function applyPreview(
    nextPreview: SkillUploadPreview,
    file: File | null,
    errorMessage = "",
  ) {
    setPreview(nextPreview);
    const defaults = getDefaultPublishDetails(nextPreview, categories, publishTarget);
    setDisplayName(defaults.displayName);
    setSlug(defaults.slug);
    setDescription(defaults.description);
    setCategory(defaults.category);
    setVersion(defaults.version);
    setTags(defaults.tags);
    setFileSource(file);
    setValidatedFile(file);
    setStep("validation");
    setUploadError(errorMessage);
  }

  function fileFromBase64(value: string, fileName: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], fileName, { type: "application/zip" });
  }

  async function uploadFile(file: File) {
    const requestId = uploadRequestRef.current + 1;
    uploadRequestRef.current = requestId;
    setUploading(true);
    setStep("upload");
    setPreview(null);
    setUploadError("");
    setPublishError("");
    setFileSource(file);
    setValidatedFile(null);
    setPublishedSkill(null);
    setRepository(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/skills/upload", { method: "POST", body: formData });
      const payload = (await response.json()) as UploadResponse;
      if (requestId !== uploadRequestRef.current) return;

      if (
        payload.validation &&
        payload.files &&
        payload.scripts &&
        payload.references &&
        payload.assets
      ) {
        const nextPreview: SkillUploadPreview = {
          skill: payload.skill ?? null,
          packageSizeBytes: payload.packageSizeBytes ?? file.size,
          skillMdPreview: payload.skillMdPreview,
          files: payload.files,
          scripts: payload.scripts,
          references: payload.references,
          assets: payload.assets,
          validation: payload.validation,
        };
        applyPreview(nextPreview, file, payload.error?.message ?? "");
        return;
      }

      setUploadError(payload.error?.message || "上传失败，请重新选择文件。");
    } catch {
      if (requestId !== uploadRequestRef.current) return;
      setUploadError("无法连接上传服务，请稍后重试。");
    } finally {
      if (requestId === uploadRequestRef.current) {
        setUploading(false);
      }
    }
  }

  async function importGithub(url: string) {
    const requestId = uploadRequestRef.current + 1;
    uploadRequestRef.current = requestId;
    setUploading(true);
    setStep("upload");
    setPreview(null);
    setUploadError("");
    setPublishError("");
    setFileSource(null);
    setValidatedFile(null);
    setPublishedSkill(null);
    setRepository(null);

    try {
      const response = await fetch("/api/skills/github/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const payload = (await response.json()) as UploadResponse;
      if (requestId !== uploadRequestRef.current) return;

      if (
        payload.validation &&
        payload.files &&
        payload.scripts &&
        payload.references &&
        payload.assets
      ) {
        const nextPreview: SkillUploadPreview = {
          skill: payload.skill ?? null,
          packageSizeBytes: payload.packageSizeBytes,
          skillMdPreview: payload.skillMdPreview,
          files: payload.files,
          scripts: payload.scripts,
          references: payload.references,
          assets: payload.assets,
          validation: payload.validation,
        };
        const importedFile =
          payload.success && payload.packageBase64 && payload.fileName
            ? fileFromBase64(payload.packageBase64, payload.fileName)
            : null;
        setRepository(payload.repository ?? null);
        applyPreview(nextPreview, importedFile, payload.error?.message ?? "");
        return;
      }

      setUploadError(payload.error?.message || "GitHub 导入失败，请稍后重试");
    } catch {
      if (requestId !== uploadRequestRef.current) return;
      setUploadError("GitHub 导入失败，请稍后重试");
    } finally {
      if (requestId === uploadRequestRef.current) {
        setUploading(false);
      }
    }
  }

  function validationNext() {
    if (!canContinueValidation(preview)) {
      setPublishError("Skill 验证未通过，请修复问题后重试。");
      return;
    }
    setPublishError("");
    setStep("details");
  }

  function detailsNext() {
    const error = getPublishDetailsError({
      displayName,
      slug,
      description,
      category,
      version,
      tags,
    });
    if (error) {
      setPublishError(error);
      return;
    }
    setPublishError("");
    setStep("confirm");
  }

  async function publishFile() {
    if (
      !canStartPublish({
        publishing: publishingRef.current,
        file: fileSource,
        preview,
        validatedFile,
      })
    ) {
      return;
    }

    const file = fileSource;
    if (!file) return;
    publishingRef.current = true;
    setStep("publishing");
    setPublishError("");

    try {
      const formData = buildPublishRequest(
        file,
        { displayName, slug, description, category, version, tags },
        publishTarget?.slug,
      );

      const response = await fetch("/api/skills/publish", { method: "POST", body: formData });
      const payload = (await response.json()) as PublishResponse;

      if (payload.success && payload.skill) {
        setPublishedSkill({ slug: payload.skill.slug, version: payload.skill.version });
        setStep("success");
        return;
      }

      if (payload.validation) {
        const detailIssue = payload.validation.issues.find((issue) =>
          isPublishDetailsValidationCode(issue.code),
        );
        if (detailIssue) {
          setStep("details");
          setPublishError(publishErrorMessage(detailIssue.code, detailIssue.message));
        } else {
          setPreview((current) =>
            current ? { ...current, validation: payload.validation! } : current,
          );
          setStep("validation");
          setPublishError("Skill 验证未通过，请修复问题后重试。");
        }
        return;
      }

      setStep("confirm");
      setPublishError(publishErrorMessage(payload.error?.code, payload.error?.message));
    } catch {
      setStep("confirm");
      setPublishError("发布失败，请稍后重试。");
    } finally {
      publishingRef.current = false;
    }
  }

  function resetUpload() {
    setStep("upload");
    setPreview(null);
    setUploadError("");
    setPublishError("");
    setFileSource(null);
    setValidatedFile(null);
    setPublishedSkill(null);
    setDisplayName("");
    setSlug("");
    setDescription("");
    setCategory("");
    setVersion("");
    setTags("");
    setRepository(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadFile(file);
  }

  if (mode === "upload" || (mode === "github" && preview)) {
    const confirmation = preview
      ? buildPublishConfirmation(
          { displayName, slug, description, category, version, tags },
          fileSource,
          preview,
        )
      : null;
    const successLinks = publishedSkill
      ? getPublishSuccessLinks(publishedSkill.slug)
      : null;
    const fileCount = confirmation?.fileCount ?? 0;
    const busy = uploading;

    return (
      <div className="mt-6">
        {mode === "upload" ? (
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={handleFileChange}
          />
        ) : null}
        {publishTarget?.authorized ? (
          <div className="mb-5 rounded-md border bg-muted/25 p-4">
            <p className="text-xs text-muted-foreground">
              为 {publishTarget.name} 发布新版本
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">技能标识：{publishTarget.slug}</p>
          </div>
        ) : null}
        {publishTarget && !publishTarget.authorized ? (
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            {publishTarget.authenticated === false
              ? "请登录后发布新版本，服务端会继续校验 Owner 权限。"
              : "当前账号无法管理这个 Skill，发布时会继续进行服务端权限校验。"}
          </div>
        ) : null}
        <StepIndicator current={step} />

        {!preview ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "正在分析技能包" : "上传技能包"}
            </Button>
            {uploadError ? <p className="text-sm text-red-700 dark:text-red-400">{uploadError}</p> : null}
          </div>
        ) : (
          <div className="mt-5 space-y-5 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {mode === "github" ? "GitHub Repository" : "当前 ZIP"}
                </p>
                <p className="mt-1 truncate font-medium">
                  {mode === "github"
                    ? repository?.fullName || githubUrl || "GitHub Repository"
                    : fileSource?.name || "未选择文件"}
                </p>
                {mode === "github" && repository ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    默认分支：{repository.defaultBranch}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {mode === "github"
                  ? repository?.url || githubUrl
                  : formatBytes(fileSource?.size)}
              </p>
            </div>

            {uploadError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {uploadError}
              </div>
            ) : null}

            {step === "validation" ? (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">SKILL.md</p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {preview.skill?.displayName || preview.skill?.name || "未解析到 Skill"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {preview.skill?.description || "暂时无法读取技能描述。"}
                  </p>
                </div>
                <ValidationSummary preview={preview} />
                {preview.skillMdPreview ? (
                  <div>
                    <h3 className="text-sm font-medium">SKILL.md 预览</h3>
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
                      {preview.skillMdPreview}
                    </pre>
                  </div>
                ) : null}
                <div>
                  <h3 className="text-sm font-medium">文件结构</h3>
                  <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-md border bg-background p-3">
                    {preview.files.map((file, index) => (
                      <div key={`${file.path}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">{file.path}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {file.type === "directory" ? "目录" : formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button type="button" onClick={validationNext} disabled={!canContinueValidation(preview)}>
                    下一步
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (mode === "github") {
                        resetUpload();
                        setOpen(true);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    {mode === "github" ? (
                      <>
                        <Github className="h-4 w-4" />
                        更换 Repository
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        更换 ZIP
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : null}

            {step === "details" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">Skill 名称</span>
                    <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">版本</span>
                    <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如 1.0.0" />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">技能标识</span>
                  <Input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    disabled={Boolean(publishTarget?.authorized)}
                    aria-describedby="slug-help"
                  />
                  <span id="slug-help" className="block text-xs text-muted-foreground">
                    用于 Skill URL，发布后不可修改
                  </span>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">分类</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  >
                    <option value="">请选择分类</option>
                    {categories.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">标签</span>
                  <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="多个标签用逗号分隔，可选" />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">描述</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                {publishError ? <p className="text-sm text-red-700 dark:text-red-400">{publishError}</p> : null}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep("validation")}>
                    <ChevronLeft className="h-4 w-4" />
                    上一步
                  </Button>
                  <Button type="button" onClick={detailsNext}>
                    查看确认信息
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold">确认发布</h2>
                  <p className="mt-1 text-sm text-muted-foreground">请确认以下信息，发布后将创建新的 Skill 版本。</p>
                </div>
                <div className="divide-y rounded-md border bg-background">
                  <ConfirmRow label="Skill 名称" value={confirmation?.displayName || ""} />
                  <ConfirmRow label="技能标识" value={confirmation?.slug || ""} />
                  <ConfirmRow label="版本" value={confirmation?.version || ""} />
                  <ConfirmRow label="分类" value={confirmation?.category || ""} />
                  <ConfirmRow label="标签" value={confirmation?.tags || "未设置"} />
                  <ConfirmRow label="ZIP" value={`${confirmation?.fileName || "未选择"} · ${formatBytes(confirmation?.fileSize)}`} />
                  <ConfirmRow label="文件数量" value={String(confirmation?.fileCount ?? 0)} />
                  <ConfirmRow label="包大小" value={formatBytes(confirmation?.packageSizeBytes)} />
                </div>
                <ValidationSummary preview={preview} />
                {publishError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {publishError}
                    {publishError.includes("登录") ? (
                      <Link className="ml-2 font-medium underline underline-offset-2" href="/login?next=/create">
                        去登录
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep("details")}>
                    <ChevronLeft className="h-4 w-4" />
                    上一步
                  </Button>
                  <Button type="button" onClick={() => void publishFile()}>
                    <Send className="h-4 w-4" />
                    发布 Skill
                  </Button>
                </div>
              </>
            ) : null}

            {step === "publishing" ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="font-medium">正在发布 Skill…</p>
                <p className="text-sm text-muted-foreground">正在重新验证 ZIP 并保存发布内容。</p>
              </div>
            ) : null}

            {step === "success" && publishedSkill ? (
              <div className="space-y-5">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <Check className="h-5 w-5" />
                    Skill 发布成功
                  </div>
                  <p className="mt-2 text-sm">版本 {publishedSkill.version} 已发布。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={successLinks?.skill || "#"}>查看 Skill</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={successLinks?.management || "#"}>进入管理</Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={resetUpload}>
                    <RotateCcw className="h-4 w-4" />
                    继续发布
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
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
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/组织/仓库"
              aria-label="GitHub 仓库地址"
              disabled={uploading}
            />
          ) : (
            <Input required placeholder="Skill 名称" aria-label="Skill 名称" />
          )}
          <Button type="submit" size="sm" disabled={uploading}>
            {mode === "github"
              ? uploading
                ? "正在读取 GitHub 仓库…"
                : "导入仓库"
              : "使用模板创建"}
          </Button>
          {mode === "github" && uploadError ? (
            <p className="text-sm text-red-700 dark:text-red-400">{uploadError}</p>
          ) : null}
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

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium text-foreground">{value}</span>
    </div>
  );
}
