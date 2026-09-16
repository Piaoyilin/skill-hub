import Link from "next/link";
import { ArrowLeft, FilePlus2, Github, Upload, WandSparkles } from "lucide-react";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { CreateOptions, type PublishTarget } from "@/components/create-options";
import {
  getRegistryOwnedSkillBySlug,
  listRegistryCategories,
} from "@/lib/registry";
import { getCurrentUser } from "@/lib/auth/server";
import { logTiming, measureAsync } from "@/lib/diagnostics/timing";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const startedAt = performance.now();
  const params = await searchParams;
  const requestedSlug = params.skill?.trim();
  let publishTarget: PublishTarget | null = null;
  const categoriesPromise = measureAsync(
    "CREATE query",
    "categories",
    () => listRegistryCategories(),
    { route: "/create" },
  );

  if (requestedSlug) {
    let currentUser;
    try {
      currentUser = await getCurrentUser({ route: "/create" });
    } catch {
      currentUser = null;
    }

    if (currentUser) {
      const ownedSkill = await measureAsync(
        "CREATE query",
        "owned skill target",
        () =>
          getRegistryOwnedSkillBySlug(
            currentUser.profile.id,
            requestedSlug,
          ),
        { route: "/create" },
      );
      publishTarget = ownedSkill
        ? {
            slug: ownedSkill.slug,
            name: ownedSkill.name,
            authorized: true,
          }
        : {
            slug: requestedSlug,
            name: "这个 Skill",
            authorized: false,
            authenticated: true,
          };
    } else {
      publishTarget = {
        slug: requestedSlug,
        name: "这个 Skill",
        authorized: false,
        authenticated: false,
      };
    }
  }

  const categories = await categoriesPromise;
  logTiming("TOTAL render/data", performance.now() - startedAt, {
    route: "/create",
    operation: "create page data",
    status: "ok",
  });

  return (
    <Container className="py-12 sm:py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回首页</Link>
      <PageHeader className="mt-8" eyebrow="分享你的工作流" title="创建一个 Skill" description="把成熟的工程方法整理成 SKILL.md，让更多 AI Agent 可以复用。" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-background p-6 transition hover:border-foreground/30">
          <WandSparkles className="h-5 w-5 text-primary" />
          <h2 className="mt-5 font-semibold">使用 AI 创建</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">描述你的工作流，让 AI 生成 Skill 草稿，再由你检查和完善。</p>
          <Link href="/create/ai" className="mt-6 inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background transition hover:bg-foreground/85">开始创建 <span aria-hidden="true">→</span></Link>
        </div>
        <div className="rounded-md border bg-background p-6 transition hover:border-foreground/30">
          <FilePlus2 className="h-5 w-5 text-primary" />
          <h2 className="mt-5 font-semibold">从零开始</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">使用模板创建一个包含说明、示例和安全声明的 Skill 包。</p>
          <CreateOptions mode="blank" />
        </div>
        <div className="rounded-md border bg-background p-6 transition hover:border-foreground/30">
          <Github className="h-5 w-5 text-primary" />
          <h2 className="mt-5 font-semibold">从 GitHub 导入</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">从公开仓库导入已有的 SKILL.md，并补充必要的元数据。</p>
          <CreateOptions
            mode="github"
            categories={categories.slice(1)}
            publishTarget={publishTarget}
          />
        </div>
        <div className="rounded-md border bg-background p-6 transition hover:border-foreground/30">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="mt-5 font-semibold">上传技能包</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">上传包含 SKILL.md 的 ZIP 文件，快速导入已有技能。</p>
          <CreateOptions
            mode="upload"
            categories={categories.slice(1)}
            publishTarget={publishTarget}
          />
        </div>
      </div>
      <div className="mt-10 rounded-md border border-dashed bg-muted/35 p-6">
        <p className="text-sm font-medium">发布前检查</p>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3"><span>01 · 清晰的用途描述</span><span>02 · 最小权限声明</span><span>03 · 可复现的示例</span></div>
      </div>
    </Container>
  );
}
