import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const accentStyles: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  black: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

export function SkillBadge({ children, accent = "indigo" }: { children: React.ReactNode; accent?: string }) {
  return <span className={cn("inline-flex items-center rounded px-2 py-1 text-[11px] font-medium", accentStyles[accent] ?? accentStyles.indigo)}>{children}</span>;
}

export function VerifiedBadge() {
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>已验证</span>;
}
