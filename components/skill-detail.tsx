"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, Clipboard, Download, FileCode2, Folder, GitBranch, GitPullRequest, Heart, LockKeyhole, Loader2, ShieldCheck, Star, UserRound } from "lucide-react";
import type { SkillView as Skill } from "@/lib/registry";
import { Container } from "@/components/container";
import { SkillBadge, VerifiedBadge } from "@/components/skill-badge";
import { cn, formatCount } from "@/lib/utils";

const tabs = [
  { id: "overview", label: "概览" },
  { id: "skill", label: "SKILL.md" },
  { id: "files", label: "文件" },
  { id: "versions", label: "版本记录" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function buildSkillMarkdown(skill: Skill) {
  return `# ${skill.name}\n\n## 目标\n${skill.description}\n\n## 工作方式\n- 先阅读仓库上下文和相关文件\n- 区分高影响问题与低价值建议\n- 给出证据、影响和可执行的下一步\n\n## 输出格式\n使用简洁的 Markdown，优先列出阻塞项和风险。`;
}

function getSkillMarkdown(skill: Skill) {
  return skill.skillMd ?? buildSkillMarkdown(skill);
}

export function SkillDetail({ skill }: { skill: Skill }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [favorite, setFavorite] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function downloadSkill() {
    if (!skill.packageAvailable || downloading) return;

    setDownloading(true);
    setDownloadError("");

    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(skill.slug)}/download`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(
          payload?.error?.message || "下载技能包失败，请稍后重试。",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${skill.slug}-${skill.version}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "下载技能包失败，请稍后重试。",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <section className="border-b bg-muted/20">
        <Container className="py-9 sm:py-12">
          <Link href="/explore" className="text-xs font-medium text-muted-foreground transition hover:text-foreground">← 返回发现</Link>
          <div className="mt-7 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-start gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-accent text-2xl font-semibold text-primary">{skill.icon}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{skill.name}</h1>
                    {skill.verified ? <VerifiedBadge /> : null}
                  </div>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{skill.description}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                    {(skill.owner?.displayName || skill.author).slice(0, 1)}
                  </span>
                  {skill.owner?.displayName || skill.author}
                </span>
                <span>更新于 {skill.updatedAt}</span>
                <span>v{skill.version}</span>
                <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{formatCount(skill.downloads)} 次下载</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {skill.canManage ? (
                <>
                  <Link
                    href={`/create?slug=${encodeURIComponent(skill.slug)}`}
                    className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted"
                  >
                    <GitBranch className="h-4 w-4" />
                    发布新版本
                  </Link>
                  <Link
                    href={`/dashboard/skills/${encodeURIComponent(skill.slug)}`}
                    className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted"
                  >
                    <UserRound className="h-4 w-4" />
                    管理技能
                  </Link>
                </>
              ) : null}
              <button type="button" onClick={() => setFavorite((current) => !current)} className={cn("inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted", favorite && "border-primary bg-accent text-accent-foreground")}>
                <Heart className={cn("h-4 w-4", favorite && "fill-current")} />{favorite ? "已收藏" : "收藏"}
              </button>
              <button type="button" onClick={downloadSkill} disabled={!skill.packageAvailable || downloading} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {!skill.packageAvailable
                  ? "暂未提供完整技能包"
                  : downloading
                    ? "正在下载"
                    : downloaded
                      ? "已下载"
                      : "下载技能"}
              </button>
            </div>
          </div>
          {downloadError ? (
            <p className="mt-3 flex items-center justify-end gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {downloadError}
            </p>
          ) : null}
          <div className="mt-8 flex gap-1 overflow-x-auto border-b">
            {tabs.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("relative whitespace-nowrap px-3 py-3 text-sm text-muted-foreground transition hover:text-foreground", activeTab === tab.id && "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary")}>{tab.label}</button>)}
          </div>
        </Container>
      </section>

      <Container className="grid gap-10 py-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {activeTab === "overview" ? <Overview skill={skill} /> : null}
          {activeTab === "skill" ? <SkillFile skill={skill} /> : null}
          {activeTab === "files" ? <Files skill={skill} /> : null}
          {activeTab === "versions" ? <VersionHistory skill={skill} /> : null}
        </div>
        <aside className="space-y-4">
          <InfoPanel skill={skill} />
          <SecurityPanel />
        </aside>
      </Container>
    </div>
  );
}

function Overview({ skill }: { skill: Skill }) {
  const useCases: { title: string; text: string; icon: LucideIcon }[] = [
    { title: "提交前", text: "在 Pull Request 创建前，快速检查关键风险。", icon: GitPullRequest },
    { title: "排查问题", text: "把复杂的工程问题拆成清晰的检查步骤。", icon: ShieldCheck },
    { title: "建立规范", text: "将团队的实践沉淀为 Agent 可以复用的能力。", icon: Clipboard },
  ];

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold">关于这个 Skill</h2>
        <div className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground">{skill.readme.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">适合在什么时候使用</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {useCases.map(({ title, text, icon: Icon }) => <div key={title} className="rounded-md border p-4"><Icon className="h-4 w-4 text-primary" /><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></div>)}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">标签</h2>
        <div className="mt-4 flex flex-wrap gap-2">{skill.tags.map((tag) => <SkillBadge key={tag} accent={skill.accent}>{tag}</SkillBadge>)}</div>
      </section>
    </div>
  );
}

function SkillFile({ skill }: { skill: Skill }) {
  const [copied, setCopied] = useState(false);
  const content = getSkillMarkdown(skill);

  async function copyContent() {
    await navigator.clipboard?.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-lg font-semibold">SKILL.md</h2><p className="mt-1 text-sm text-muted-foreground">这个 Skill 的使用说明和行为约定。</p></div>
        <button type="button" title={copied ? "已复制" : "复制内容"} aria-label={copied ? "已复制" : "复制内容"} onClick={copyContent} className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Clipboard className="h-4 w-4" />}</button>
      </div>
      <div className="code-scroll mt-6 overflow-x-auto rounded-md border bg-zinc-950 p-5 text-sm leading-7 text-zinc-300">
        <pre><code>{content}</code></pre>
      </div>
    </section>
  );
}

function Files({ skill }: { skill: Skill }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">文件</h2>
      <p className="mt-1 text-sm text-muted-foreground">Skill 包含的文件和目录。</p>
      <div className="mt-6 divide-y rounded-md border">
        {skill.files.map((file) => <div key={file.name} className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm"><span className="flex min-w-0 items-center gap-3">{file.type === "folder" ? <Folder className="h-4 w-4 shrink-0 text-primary" /> : <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />}<span className="truncate">{file.name}</span></span>{file.size ? <span className="shrink-0 text-xs text-muted-foreground">{file.size}</span> : <span className="text-xs text-muted-foreground">目录</span>}</div>)}
      </div>
    </section>
  );
}

function Versions({ skill }: { skill: Skill }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">版本记录</h2>
      <p className="mt-1 text-sm text-muted-foreground">查看这个 Skill 的更新历史。</p>
      <div className="mt-6 space-y-0">
        {skill.changelog.map((item, index) => <div key={item.version} className="relative flex gap-4 pb-8"><div className="relative flex w-5 shrink-0 justify-center"><span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full border-2 bg-background", index === 0 ? "border-primary" : "border-muted-foreground/40")} />{index < skill.changelog.length - 1 ? <span className="absolute top-4 h-full w-px bg-border" /> : null}</div><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-semibold">v{item.version}</h3><span className="text-xs text-muted-foreground">{item.date}</span>{index === 0 ? <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">当前版本</span> : null}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.note}</p></div></div>)}
      </div>
    </section>
  );
}

export function VersionHistory({ skill }: { skill: Skill }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">版本记录</h2>
      <p className="mt-1 text-sm text-muted-foreground">查看这个 Skill 的更新历史。</p>
      {skill.versions.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          暂无版本记录
        </p>
      ) : (
        <div className="mt-6 space-y-0">
          {skill.versions.map((item, index) => (
            <div
              key={`${item.version}-${item.publishedAt}`}
              className="relative flex gap-4 pb-8"
            >
              <div className="relative flex w-5 shrink-0 justify-center">
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 rounded-full border-2 bg-background",
                    item.isCurrent
                      ? "border-primary"
                      : "border-muted-foreground/40",
                  )}
                />
                {index < skill.versions.length - 1 ? (
                  <span className="absolute top-4 h-full w-px bg-border" />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold">
                    {item.version.startsWith("v")
                      ? item.version
                      : `v${item.version}`}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    发布于 {item.publishedAt}
                  </span>
                  {item.isCurrent ? (
                    <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                      当前版本
                    </span>
                  ) : null}
                </div>
                {item.changelog.map((change) => (
                  <p
                    key={`${change.version}-${change.date}-${change.note}`}
                    className="mt-2 text-sm leading-6 text-muted-foreground"
                  >
                    {change.note}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoPanel({ skill }: { skill: Skill }) {
  return (
    <div className="rounded-md border bg-background p-5">
      <h2 className="text-sm font-semibold">Skill 信息</h2>
      <dl className="mt-5 space-y-4 text-sm">
        <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">版本</dt><dd className="font-medium">v{skill.version}</dd></div>
        <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">许可证</dt><dd className="font-medium">MIT</dd></div>
        <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">分类</dt><dd><SkillBadge accent={skill.accent}>{skill.category}</SkillBadge></dd></div>
        <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">收藏</dt><dd className="inline-flex items-center gap-1 font-medium"><Star className="h-3.5 w-3.5 text-amber-500" />{formatCount(skill.stars)}</dd></div>
      </dl>
      <div className="mt-5 border-t pt-4">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          由 <span className="font-medium text-foreground">{skill.owner?.displayName || skill.author}</span> 发布
        </p>
        {skill.owner?.username ? (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">@{skill.owner.username}</p>
        ) : null}
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          兼容 Codex 与 Claude Code
        </p>
      </div>
    </div>
  );
}

function SecurityPanel() {
  return (
    <div className="rounded-md border bg-background p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /><h2 className="text-sm font-semibold">安全检查</h2></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Skill Hub 已对这个 Skill 的内容和权限声明进行基础检查。</p>
      <div className="mt-4 space-y-2.5 text-xs">{["无外部脚本依赖", "无敏感信息读取", "权限范围清晰"].map((item) => <p key={item} className="flex items-center gap-2 text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-500" />{item}</p>)}</div>
      <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground"><LockKeyhole className="h-3 w-3" />最近检查于 2026 年 3 月</p>
    </div>
  );
}
