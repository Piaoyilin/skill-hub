import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Box, CheckCircle2, Code2, FileText, Monitor, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryMeta: Record<string, { description: string; icon: LucideIcon; iconClass: string }> = {
  代码质量: {
    description: "代码审查、重构与质量检查",
    icon: Code2,
    iconClass: "border-indigo-200 bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:group-hover:bg-indigo-950",
  },
  开发效率: {
    description: "自动化日常开发工作流",
    icon: Zap,
    iconClass: "border-violet-200 bg-violet-50 text-violet-700 group-hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300 dark:group-hover:bg-violet-950",
  },
  文档生成: {
    description: "README、API 与项目文档",
    icon: FileText,
    iconClass: "border-sky-200 bg-sky-50 text-sky-700 group-hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:group-hover:bg-sky-950",
  },
  测试: {
    description: "单元测试与质量保障",
    icon: CheckCircle2,
    iconClass: "border-emerald-200 bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:group-hover:bg-emerald-950",
  },
  安全: {
    description: "漏洞、依赖与敏感信息检查",
    icon: ShieldCheck,
    iconClass: "border-rose-200 bg-rose-50 text-rose-700 group-hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:group-hover:bg-rose-950",
  },
  DevOps: {
    description: "Docker、CI/CD 与部署优化",
    icon: Box,
    iconClass: "border-amber-200 bg-amber-50 text-amber-700 group-hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:group-hover:bg-amber-950",
  },
  前端: {
    description: "React、Next.js 与 Web 开发",
    icon: Monitor,
    iconClass: "border-cyan-200 bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 dark:group-hover:bg-cyan-950",
  },
};

export function CategoryChip({
  name,
  count,
  href = `/explore?category=${encodeURIComponent(name)}`,
  className,
}: {
  name: string;
  count?: number;
  href?: string;
  className?: string;
}) {
  const meta = categoryMeta[name];
  const Icon = meta?.icon ?? Code2;

  return (
    <Link
      href={href}
      className={cn("group flex min-h-[168px] flex-col justify-between rounded-md border bg-background p-5 shadow-sm transition-colors duration-150 hover:border-primary/40 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-md border transition-colors", meta?.iconClass ?? "border-primary/20 bg-accent text-primary group-hover:bg-accent/80")}>
          <Icon className="h-5 w-5" />
        </span>
        <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="mt-6">
        <h3 className="text-base font-semibold text-foreground">{name}</h3>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{meta?.description ?? "探索适合你的工作流工具"}</p>
        {count !== undefined ? <p className="mt-3 text-xs font-medium text-muted-foreground">{count} 个技能</p> : null}
      </div>
    </Link>
  );
}
