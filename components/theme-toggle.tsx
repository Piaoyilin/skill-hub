"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("skill-hub-theme");
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("skill-hub-theme", next ? "dark" : "light");
  }

  return (
    <button type="button" onClick={toggle} aria-label={dark ? "切换到浅色模式" : "切换到深色模式"} title={dark ? "切换到浅色模式" : "切换到深色模式"} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:border-foreground/30 hover:text-foreground", className)}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
