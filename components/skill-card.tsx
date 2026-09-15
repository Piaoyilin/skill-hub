import Link from "next/link";
import { ArrowUpRight, Download, Star } from "lucide-react";
import type { SkillView as Skill } from "@/lib/registry";
import { cn, formatCount } from "@/lib/utils";
import { SkillBadge, VerifiedBadge } from "@/components/skill-badge";

const iconStyles: Record<string, string> = {
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300",
  orange: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
  slate: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  black: "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="group flex min-h-[260px] flex-col rounded-md border bg-background p-5 shadow-sm transition-colors duration-150 hover:border-primary/40 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-4">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-lg border text-lg font-semibold", iconStyles[skill.accent] ?? iconStyles.indigo)}>
          {skill.icon}
        </span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-5 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[21px] font-semibold leading-7 text-foreground transition-colors group-hover:text-primary">{skill.name}</h3>
          {skill.verified ? <VerifiedBadge /> : null}
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{skill.description}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {skill.tags.slice(0, 3).map((tag) => <SkillBadge key={tag} accent={skill.accent}>{tag}</SkillBadge>)}
      </div>
      <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold text-background">{skill.author.slice(0, 1)}</span>
          <span className="truncate">{skill.author}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{formatCount(skill.downloads)}</span>
          <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{formatCount(skill.stars)}</span>
        </span>
      </div>
    </Link>
  );
}
