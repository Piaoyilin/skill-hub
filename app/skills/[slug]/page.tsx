import { notFound } from "next/navigation";
import { SkillDetail } from "@/components/skill-detail";
import { getRegistrySkillBySlug } from "@/lib/registry";
import { getCurrentUser } from "@/lib/auth/server";
import { getFavoriteStatusForSlug } from "@/lib/registry/favorites";

export const dynamic = "force-dynamic";

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    currentUser = null;
  }

  const skill = await getRegistrySkillBySlug(slug, {
    viewerId: currentUser?.profile.id,
  });
  if (!skill) notFound();

  const initialFavorited = currentUser
    ? await getFavoriteStatusForSlug(currentUser.profile.id, slug)
    : false;

  return <SkillDetail skill={skill} initialFavorited={initialFavorited} />;
}
