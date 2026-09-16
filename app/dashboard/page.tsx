import Link from "next/link";
import { FileUp, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/container";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SkillGrid } from "@/components/skill-grid";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { measureAsync } from "@/lib/diagnostics/timing";
import {
  getFavoriteSkillsForUser,
  listRegistryOwnedSkills,
  type OwnedSkillView,
  type SkillView,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab === "favorites" ? "favorites" : "skills";
  let currentUser;
  try {
    currentUser = await getCurrentUser({ route: "/dashboard" });
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    redirect("/login?next=/dashboard");
  }

  let skills: OwnedSkillView[] = [];
  let favoriteSkills: SkillView[] = [];

  if (activeTab === "favorites") {
    favoriteSkills = await measureAsync(
      "TOTAL render/data",
      "dashboard favorites",
      () => getFavoriteSkillsForUser(currentUser.profile.id),
      { route: "/dashboard", tab: activeTab },
    );
  } else {
    skills = await measureAsync(
      "TOTAL render/data",
      "dashboard owned skills",
      () => listRegistryOwnedSkills(currentUser.profile.id),
      { route: "/dashboard", tab: activeTab },
    );
  }

  return (
    <Container className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Skill Hub 控制台"
        title="个人中心"
        description={`管理 ${currentUser.profile.displayName} 发布的 Skill，并查看收藏。`}
        actions={
          <Button asChild>
            <Link href="/create">
              <FileUp className="h-4 w-4" />
              发布 Skill
            </Link>
          </Button>
        }
      />
      <div className="mt-8 flex gap-1 border-b">
        <Link
          href="/dashboard?tab=skills"
          className={`relative px-3 py-3 text-sm transition-colors hover:text-foreground ${activeTab === "skills" ? "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary" : "text-muted-foreground"}`}
        >
          我的 Skill
        </Link>
        <Link
          href="/dashboard?tab=favorites"
          className={`relative px-3 py-3 text-sm transition-colors hover:text-foreground ${activeTab === "favorites" ? "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary" : "text-muted-foreground"}`}
        >
          我的收藏
        </Link>
      </div>
      {activeTab === "favorites" ? (
        <section className="mt-8">
          {favoriteSkills.length === 0 ? (
            <EmptyState
              title="你还没有收藏任何 Skill"
              description="去发现适合你的 Skill，收藏后会显示在这里。"
              action={
                <Button asChild variant="outline">
                  <Link href="/explore">发现 Skill</Link>
                </Button>
              }
            />
          ) : (
            <SkillGrid skills={favoriteSkills} />
          )}
        </section>
      ) : (
        <section className="mt-8">
          {skills.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center">
              <h2 className="text-lg font-semibold">还没有发布 Skill</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                上传一个包含 SKILL.md 的 ZIP，开始分享你的工作流。
              </p>
              <Button asChild className="mt-6">
                <Link href="/create">创建第一个 Skill</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
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
                      <p className="mt-1 text-xs text-muted-foreground">更新于 {skill.updatedAt}</p>
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
        </section>
      )}
    </Container>
  );
}
