"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "register";

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (normalized.includes("user already registered")) return "该邮箱已经注册，请直接登录。";
  if (normalized.includes("password")) return "密码不符合要求，请使用至少 6 位字符。";
  if (normalized.includes("email")) return "请输入有效的邮箱地址。";
  if (normalized.includes("rate limit")) return "操作过于频繁，请稍后再试。";
  return "操作未完成，请稍后重试。";
}

export function AuthForm({
  mode,
  nextPath = "/dashboard",
}: {
  mode: AuthMode;
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabaseBrowserClient();
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: displayName.trim()
                  ? { display_name: displayName.trim() }
                  : undefined,
              },
            });

      if (result.error) {
        setError(authErrorMessage(result.error.message));
        return;
      }

      if (mode === "register" && !result.data.session) {
        setNotice("注册成功。请先完成邮箱确认，再使用新账户登录。");
        return;
      }

      router.push(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.includes("Supabase")
          ? "尚未配置 Supabase Auth，请联系项目管理员。"
          : "暂时无法连接认证服务，请稍后重试。",
      );
    } finally {
      setPending(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <form onSubmit={submit} className="space-y-4">
      {!isLogin ? (
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">显示名称</span>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="例如：林晨"
            autoComplete="name"
          />
        </label>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted-foreground">邮箱</span>
        <Input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted-foreground">密码</span>
        <Input
          required
          minLength={6}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 6 位字符"
          autoComplete={isLogin ? "current-password" : "new-password"}
        />
      </label>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isLogin ? (
          <LogIn className="h-4 w-4" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        {pending ? "处理中" : isLogin ? "登录" : "注册"}
      </Button>
    </form>
  );
}
