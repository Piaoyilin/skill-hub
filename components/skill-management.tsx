"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  Save,
} from "lucide-react";
import type {
  CategoryView,
  ManagedSkillView,
} from "@/lib/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ManagementState = "idle" | "saving" | "archiving" | "restoring";

function formatPackageSize(size: number | null) {
  if (size === null) return "未知大小";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: ManagedSkillView["status"]) {
  if (status === "PUBLISHED") return "已发布";
  if (status === "ARCHIVED") return "已下架";
  return "草稿";
}

export function SkillManagement({
  skill,
  categories,
}: {
  skill: ManagedSkillView;
  categories: CategoryView[];
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [category, setCategory] = useState(skill.category);
  const [tags, setTags] = useState(skill.tags.join(", "));
  const [state, setState] = useState<ManagementState>("idle");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const busy = state !== "idle";

  async function updateBasicInfo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(skill.slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName,
            description,
            category,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "基本信息保存失败，请稍后重试。");
      }

      setMessage("基本信息已保存。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "基本信息保存失败，请稍后重试。",
      );
    } finally {
      setState("idle");
    }
  }

  async function changeStatus(action: "archive" | "restore") {
    setState(action === "archive" ? "archiving" : "restoring");
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(skill.slug)}/${action}`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error?.message ||
            (action === "archive"
              ? "Skill 下架失败，请稍后重试。"
              : "Skill 重新上架失败，请稍后重试。"),
        );
      }

      setMessage(action === "archive" ? "Skill 已下架。" : "Skill 已重新上架。");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : action === "archive"
            ? "Skill 下架失败，请稍后重试。"
            : "Skill 重新上架失败，请稍后重试。",
      );
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border bg-accent font-semibold text-primary">
              {skill.icon}
            </span>
            <div>
              <p className="text-xs text-muted-foreground">管理 Skill</p>
              <h1 className="mt-1 truncate text-2xl font-bold">{skill.name}</h1>
            </div>
          </div>
          <p className="mt-4 break-all text-sm text-muted-foreground">
            {skill.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {skill.status === "PUBLISHED" ? (
            <Button asChild variant="outline">
              <Link href={`/skills/${skill.slug}`}>
                <ExternalLink className="h-4 w-4" />
                查看公开页面
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              <ExternalLink className="h-4 w-4" />
              公开页面已隐藏
            </Button>
          )}
          <Button asChild>
            <Link href={`/create?skill=${encodeURIComponent(skill.slug)}`}>
              <GitBranch className="h-4 w-4" />
              发布新版本
            </Link>
          </Button>
        </div>
      </section>

      {message ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">概览</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="状态" value={statusLabel(skill.status)} />
          <Metric label="当前版本" value={skill.version === "未发布" ? skill.version : `v${skill.version}`} />
          <Metric label="下载量" value={String(skill.downloads)} />
          <Metric label="收藏量" value={String(skill.stars)} />
        </div>
        <dl className="mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">创建时间</dt>
            <dd className="mt-1">{skill.createdAt}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">更新时间</dt>
            <dd className="mt-1">{skill.updatedAt}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="mt-1">{skill.owner?.displayName || skill.author}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">账号</dt>
            <dd className="mt-1">{skill.owner?.username ? `@${skill.owner.username}` : "未关联"}</dd>
          </div>
        </dl>
      </section>

      <section className="border-t pt-8">
        <div>
          <h2 className="text-lg font-semibold">基本信息</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            这些内容会显示在公开 Skill 页面中。
          </p>
        </div>
        <form onSubmit={updateBasicInfo} className="mt-5 max-w-2xl space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">展示名称</span>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={busy}
              maxLength={200}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">描述</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
              maxLength={5000}
              rows={4}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">分类</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {categories.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">标签</span>
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              disabled={busy}
              placeholder="多个标签用逗号分隔"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {state === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {state === "saving" ? "正在保存" : "保存基本信息"}
          </Button>
        </form>
      </section>

      <section className="border-t pt-8">
        <div>
          <h2 className="text-lg font-semibold">版本记录</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            查看已发布版本和对应的完整技能包。
          </p>
        </div>
        {skill.versions.length === 0 ? (
          <p className="mt-5 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无版本记录
          </p>
        ) : (
          <div className="mt-5 divide-y rounded-md border">
            {skill.versions.map((version) => (
              <div
                key={version.version}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {version.version.startsWith("v")
                        ? version.version
                        : `v${version.version}`}
                    </span>
                    {version.isCurrent ? (
                      <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        当前版本
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    发布于 {version.publishedAt} · {formatPackageSize(version.packageSize)} · {version.fileCount} 个文件
                  </p>
                </div>
                {version.packageAvailable ? (
                  <a
                    href={`/api/skills/${encodeURIComponent(skill.slug)}/download?version=${encodeURIComponent(version.version)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    下载此版本
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    暂无完整技能包
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-t pt-8">
        <h2 className="text-lg font-semibold">危险操作</h2>
        <div className="mt-4 flex flex-col gap-4 rounded-md border border-amber-300/60 bg-amber-50/50 p-4 dark:border-amber-800/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">
              {skill.status === "ARCHIVED" ? "重新上架 Skill" : "下架 Skill"}
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              {skill.status === "ARCHIVED"
                ? "重新上架后，该 Skill 将恢复出现在公开发现、搜索和详情页面中。"
                : "下架后，该 Skill 将从公开发现、搜索和详情页面中隐藏，但版本和文件仍会保留，你可以随时重新上架。"}
            </p>
          </div>
          {skill.status === "PUBLISHED" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void changeStatus("archive")}
            >
              {state === "archiving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {state === "archiving" ? "正在下架" : "下架 Skill"}
            </Button>
          ) : skill.status === "ARCHIVED" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void changeStatus("restore")}
            >
              {state === "restoring" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArchiveRestore className="h-4 w-4" />
              )}
              {state === "restoring" ? "正在上架" : "重新上架"}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
