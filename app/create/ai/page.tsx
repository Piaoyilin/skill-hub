import Link from "next/link";
import { ArrowLeft, WandSparkles } from "lucide-react";
import { Container } from "@/components/container";
import { AiSkillBuilder } from "@/components/ai-skill-builder";

export default function AiCreatePage() {
  return (
    <Container className="py-12 sm:py-16">
      <Link href="/create" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />返回创建方式
      </Link>
      <div className="mt-8 flex items-start gap-4 border-b pb-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"><WandSparkles className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">AI Skill Builder</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">用 AI 创建 Skill</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">描述你的工程工作流，生成一个可编辑的 SKILL.md 草稿。当前使用 Mock 交互，不会调用真实 API。</p>
        </div>
      </div>
      <AiSkillBuilder />
    </Container>
  );
}
