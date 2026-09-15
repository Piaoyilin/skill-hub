import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { Container } from "@/components/container";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  return (
    <Container className="flex min-h-[calc(100vh-4rem)] max-w-xl items-center py-12">
      <div className="w-full rounded-md border bg-background p-6 shadow-sm sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回首页
        </Link>
        <div className="mt-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">创建 Skill Hub 账户</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            使用邮箱注册，发布并管理属于你的 Skill。
          </p>
        </div>
        <div className="mt-8">
          <AuthForm mode="register" nextPath={nextPath} />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          已经有账户？{" "}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-medium text-primary hover:underline">
            登录
          </Link>
        </p>
      </div>
    </Container>
  );
}
