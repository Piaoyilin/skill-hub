import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { Container } from "@/components/container";
import { AuthForm } from "@/components/auth-form";
import { logTiming } from "@/lib/diagnostics/timing";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  logTiming("TOTAL render/data", 0, {
    route: "/login",
    operation: "login page static data",
    status: "ok",
  });

  return (
    <Container className="flex min-h-[calc(100vh-4rem)] max-w-xl items-center py-12">
      <div className="w-full rounded-md border bg-background p-6 shadow-sm sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回首页
        </Link>
        <div className="mt-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">登录 Skill Hub</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            登录后可以发布 Skill，并管理自己发布的版本。
          </p>
        </div>
        <div className="mt-8">
          <AuthForm mode="login" nextPath={nextPath} />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          还没有账户？{" "}
          <Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="font-medium text-primary hover:underline">
            注册
          </Link>
        </p>
      </div>
    </Container>
  );
}
