import type { SkillView as Skill } from "@/lib/registry";
import { SkillCard } from "@/components/skill-card";

export function SkillGrid({ skills }: { skills: Skill[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{skills.map((skill) => <SkillCard key={skill.slug} skill={skill} />)}</div>;
}
