import { notFound } from "next/navigation";
import { SkillDetail } from "@/components/skill-detail";
import { getRegistrySkillBySlug } from "@/lib/registry";
import { getCurrentUser } from "@/lib/auth/server";
import { getFavoriteStatus } from "@/lib/registry/favorites";
import { measureAsync } from "@/lib/diagnostics/timing";

export const dynamic = "force-dynamic";

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const currentUserPromise = getCurrentUser({ route: "/skills/[slug]" }).catch(
    () => null,
  );
  const skillPromise = measureAsync(
    "TOTAL render/data",
    "skill detail registry",
    () =>
      getRegistrySkillBySlug(slug, {
        includeServerIds: true,
      }),
    { route: "/skills/[slug]" },
  );
  const [currentUser, skill] = await Promise.all([
    currentUserPromise,
    skillPromise,
  ]);
  if (!skill) notFound();

  const initialFavorited = currentUser && skill.databaseId
    ? await measureAsync(
        "SKILL DETAIL query",
        "favorite status",
        () => getFavoriteStatus(currentUser.profile.id, skill.databaseId!),
        { route: "/skills/[slug]" },
      )
    : false;
  const {
    databaseId: _databaseId,
    ownerProfileId,
    ...clientSkill
  } = skill;

  clientSkill.canManage = Boolean(
    currentUser && ownerProfileId && currentUser.profile.id === ownerProfileId,
  );

  return <SkillDetail skill={clientSkill} initialFavorited={initialFavorited} />;
}
