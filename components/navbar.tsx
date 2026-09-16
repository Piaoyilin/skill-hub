"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import { Container } from "@/components/container";
import { ThemeToggle } from "@/components/theme-toggle";
import { logTimingEvent, measureAsync } from "@/lib/diagnostics/timing";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const navItems = [
    { href: "/explore", label: "发现技能", active: pathname === "/explore" },
    { href: "/#categories", label: "分类", active: pathname === "/" },
    { href: "/#latest", label: "最新发布", active: pathname === "/" },
  ];

  useEffect(() => {
    let active = true;

    try {
      const supabase = getSupabaseBrowserClient();
      void measureAsync(
        "AUTH browser getUser",
        "navbar initialization",
        () => supabase.auth.getUser(),
        { route: pathname },
      ).then(({ data }) => {
        if (!active) return;
        setAuthUser(data.user);
        setAuthReady(true);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setAuthUser(session?.user ?? null);
        setAuthReady(true);
      });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      setAuthReady(true);
      return () => {
        active = false;
      };
    }
  }, []);

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await measureAsync(
        "AUTH browser signOut",
        "navbar",
        () => supabase.auth.signOut(),
        { route: pathname },
      );
    } finally {
      setAuthUser(null);
      logTimingEvent("AUTH signOut refresh", { route: pathname });
      router.refresh();
    }
  }

  const mobileItems = [
    ["/explore", "发现技能"],
    ["/#categories", "分类"],
    ["/#latest", "最新发布"],
    ["/create", "创建 Skill"],
    ...(authUser
      ? [["/dashboard", "个人中心"]]
      : [
          ["/login", "登录"],
          ["/register", "注册"],
        ]),
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95">
      <Container className="flex h-16 items-center justify-between gap-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
            <Terminal className="h-4 w-4" />
          </span>
          <span>Skill Hub</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 transition-colors hover:bg-muted hover:text-foreground ${item.active && item.href === "/explore" ? "bg-accent font-medium text-accent-foreground" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/create"
            className="hidden items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted sm:inline-flex"
          >
            <Plus className="h-4 w-4" />
            创建 Skill
          </Link>
          {authReady && authUser ? (
            <div className="hidden items-center gap-1 sm:flex">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <UserRound className="h-4 w-4" />
                个人中心
              </Link>
              <button
                type="button"
                title="退出登录"
                aria-label="退出登录"
                onClick={() => void signOut()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : authReady ? (
            <div className="hidden items-center gap-1 sm:flex">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogIn className="h-4 w-4" />
                登录
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted"
              >
                注册
              </Link>
            </div>
          ) : null}
          <ThemeToggle />
          <button
            type="button"
            aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
            title={mobileOpen ? "关闭菜单" : "打开菜单"}
            onClick={() => setMobileOpen((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link
            href="/explore"
            className="hidden items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            开始使用
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Container>
      {mobileOpen ? (
        <nav className="border-t bg-background px-5 py-3 md:hidden">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-1 px-1">
            {mobileItems.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${href === "/explore" && pathname === "/explore" ? "bg-accent font-medium text-accent-foreground" : ""}`}
              >
                {label}
              </Link>
            ))}
            {authUser ? (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  void signOut();
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
