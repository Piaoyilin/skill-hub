import { notFound } from "next/navigation";
import { SkillDetail } from "@/components/skill-detail";
import { getRegistrySkillBySlug } from "@/lib/registry";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let viewerId: string | undefined;
  try {
    viewerId = (await getCurrentUser())?.profile.id;
  } catch {
    viewerId = undefined;
  }

  const skill = await getRegistrySkillBySlug(slug, { viewerId });
  if (!skill) notFound();
  return <SkillDetail skill={skill} />;
}
