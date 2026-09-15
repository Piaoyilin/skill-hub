import Link from "next/link";
import { FileUp, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { listRegistryOwnedSkills } from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    redirect("/login?next=/dashboard");
  }

  const skills = await listRegistryOwnedSkills(currentUser.profile.id);

  return (
    <Container className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Skill Hub 控制台"
        title="我的技能"
        description={`管理 ${currentUser.profile.displayName} 发布的 Skill 和版本。`}
        actions={
          <Button asChild>
            <Link href="/create">
              <FileUp className="h-4 w-4" />
              发布 Skill
            </Link>
          </Button>
        }
      />
      {skills.length === 0 ? (
        <div className="mt-10 rounded-md border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">还没有发布 Skill</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            上传一个包含 SKILL.md 的 ZIP，开始分享你的工作流。
          </p>
          <Button asChild className="mt-6">
            <Link href="/create">创建第一个 Skill</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-md border">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_100px_100px_64px] gap-4 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground">
            <span>Skill</span>
            <span>当前版本</span>
            <span>状态</span>
            <span>下载量</span>
            <span />
          </div>
          <div className="divide-y">
            {skills.map((skill) => (
              <div key={skill.slug} className="grid grid-cols-[minmax(0,1fr)_110px_100px_100px_64px] items-center gap-4 px-4 py-4 text-sm">
                <div className="min-w-0">
                  <Link
                    href={
                      skill.status === "PUBLISHED"
                        ? `/skills/${skill.slug}`
                        : `/dashboard/skills/${skill.slug}`
                    }
                    className="truncate font-medium hover:text-primary"
                  >
                    {skill.name}
                  </Link>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{skill.slug}</p>
                </div>
                <span className="text-muted-foreground">v{skill.version}</span>
                <span className="text-muted-foreground">
                  {skill.status === "PUBLISHED"
                    ? "已发布"
                    : skill.status === "ARCHIVED"
                      ? "已下架"
                      : "草稿"}
                </span>
                <span className="text-muted-foreground">{skill.downloads}</span>
                <Link
                  href={`/dashboard/skills/${skill.slug}`}
                  aria-label={`查看 ${skill.name}`}
                  title="管理技能"
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  管理
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
