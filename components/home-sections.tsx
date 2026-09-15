"use client";

import Link from "next/link";
import { ArrowRight, Command, Github, GitPullRequest, Package, ShieldCheck, Sparkles } from "lucide-react";
import type { HomeRegistryData } from "@/lib/registry";
import { Container } from "@/components/container";
import { SearchBar } from "@/components/search-bar";
import { SkillGrid } from "@/components/skill-grid";
import { CategoryChip } from "@/components/category-chip";

export function HomeSections({ data }: { data: HomeRegistryData }) {
  const { categories, featuredSkills, latestSkills } = data;

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="grid-paper absolute inset-0 opacity-70" />
        <Container className="relative py-16 sm:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/85 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              面向 AI Coding Agent 的开放 Skill 市场
            </div>
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.06] text-foreground sm:text-6xl">
              让 AI Agent
              <br />
              <span className="text-primary">拥有更多能力</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              发现经过社区验证的可复用 Skills，把成熟的工程经验直接带进你的下一次编码任务。
            </p>
            <SearchBar large className="mt-9 max-w-[800px]" placeholder="搜索 React 性能、代码审查、API 文档..." />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Command className="h-3.5 w-3.5" />支持自然语言搜索</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />每个 Skill 都有安全检查</span>
              <span className="inline-flex items-center gap-1.5"><Github className="h-3.5 w-3.5" />兼容 GitHub 工作流</span>
            </div>
          </div>
          <div className="mt-12 grid w-full grid-cols-2 border-l border-t bg-background/75 sm:grid-cols-4">
            {[
              ["128+", "社区 Skills"],
              ["42k", "累计下载"],
              ["89", "贡献者"],
              ["100%", "开放格式"],
            ].map(([value, label]) => (
              <div key={label} className="border-b border-r p-4 sm:p-5">
                <p className="text-xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b bg-background">
        <Container className="py-14 sm:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">精选推荐</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">热门技能</h2>
              <p className="mt-2 text-sm text-muted-foreground">社区正在频繁使用和维护的 Skills。</p>
            </div>
            <Link href="/explore" className="hidden items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex">
              查看全部 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <SkillGrid skills={featuredSkills} />
          <Link href="/explore" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary sm:hidden">
            查看全部技能 <ArrowRight className="h-4 w-4" />
          </Link>
        </Container>
      </section>

      <section id="categories" className="border-b bg-muted/25">
        <Container className="py-14 sm:py-16">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">按工作流探索</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight">按分类浏览</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">按工作流快速定位适合当前任务的 Skill。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(1).map((category) => <CategoryChip key={category.name} {...category} />)}
          </div>
        </Container>
      </section>

      <section id="latest" className="border-b bg-background">
        <Container className="py-14 sm:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">刚刚加入社区</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">最新发布</h2>
            </div>
            <Link href="/explore?sort=newest" className="hidden items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex">
              按最新查看 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y rounded-md border bg-background">
            {latestSkills.map((skill) => (
              <Link key={skill.slug} href={`/skills/${skill.slug}`} className="group flex flex-col gap-4 p-5 transition hover:bg-muted/45 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-accent text-sm font-semibold text-primary">{skill.icon}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold transition-colors group-hover:text-primary">{skill.name}</h3>
                      <span className="text-xs text-muted-foreground">v{skill.version}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{skill.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 pl-14 text-xs text-muted-foreground sm:pl-0">
                  <span>{skill.category}</span>
                  <span>{skill.updatedAt}</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t bg-foreground text-background">
        <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" />把你的工作流分享给社区</p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-background/65">创建一个 Skill，让更多 Agent 复用你的工程经验。</p>
          </div>
          <Link href="/create" className="inline-flex w-fit items-center gap-2 rounded-md bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-background/90">
            <Package className="h-4 w-4" /> 创建 Skill
          </Link>
        </Container>
      </section>
    </>
  );
}
