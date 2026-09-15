import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { SkillManagement } from "@/components/skill-management";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getRegistryOwnedSkillBySlug,
  listRegistryCategories,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function SkillManagementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let currentUser;

  try {
    currentUser = await getCurrentUser();
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    redirect(`/login?next=/dashboard/skills/${encodeURIComponent(slug)}`);
  }

  const [skill, categories] = await Promise.all([
    getRegistryOwnedSkillBySlug(currentUser.profile.id, slug),
    listRegistryCategories(),
  ]);

  if (!skill) notFound();

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Skill Hub 控制台"
        title="管理 Skill"
        description="编辑展示信息、管理发布状态，并查看所有版本。"
      />
      <div className="mt-10">
        <SkillManagement
          skill={skill}
          categories={categories.filter((item) => item.name !== "全部技能")}
        />
      </div>
    </Container>
  );
}
