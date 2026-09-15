"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import type { CategoryView, SkillView } from "@/lib/registry";
import { Container } from "@/components/container";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { SkillGrid } from "@/components/skill-grid";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type SortOption = "relevance" | "newest" | "downloads" | "stars";

export function ExploreClient({
  skills,
  categories,
  initialQuery = "",
  initialCategory = "",
  initialSort = "relevance",
}: {
  skills: SkillView[];
  categories: CategoryView[];
  initialQuery?: string;
  initialCategory?: string;
  initialSort?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState<SortOption>((initialSort as SortOption) || "relevance");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = skills.filter((skill) => {
      const matchQuery = !normalized || [skill.name, skill.description, skill.category, ...skill.tags].join(" ").toLowerCase().includes(normalized);
      const matchCategory = !category || category === "全部技能" || skill.category === category;
      return matchQuery && matchCategory;
    });
    return [...result].sort((a, b) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "downloads") return b.downloads - a.downloads;
      if (sort === "stars") return b.stars - a.stars;
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [category, query, sort, skills]);

  return (
    <div>
      <section className="border-b bg-muted/20">
        <Container className="py-10 sm:py-14">
          <PageHeader
            eyebrow="Skill 目录"
            title="发现适合你的 Skill"
            description="从社区精选的可复用能力中，找到下一次编码任务需要的工具。"
            actions={
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="md:hidden"><Filter className="h-4 w-4" />筛选</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                  <SheetHeader><SheetTitle>筛选 Skill</SheetTitle></SheetHeader>
                  <FilterPanel categories={categories} category={category} setCategory={setCategory} onSelect={() => setMobileFiltersOpen(false)} />
                </SheetContent>
              </Sheet>
            }
          />
          <SearchBar value={query} onValueChange={setQuery} className="mt-8 max-w-[800px]" placeholder="搜索 Skill、标签或技术栈..." />
        </Container>
      </section>

      <Container className="grid gap-8 py-8 sm:py-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r pr-6 md:block">
          <FilterPanel categories={categories} category={category} setCategory={setCategory} />
        </aside>
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">找到 <span className="font-semibold text-foreground">{filteredSkills.length}</span> 个 Skill{category ? <span> · {category}</span> : null}</p>
            <SortSelect value={sort} onChange={setSort} />
          </div>
          {filteredSkills.length ? <SkillGrid skills={filteredSkills} /> : <EmptyState />}
        </div>
      </Container>

    </div>
  );
}

function FilterPanel({ categories, category, setCategory, onSelect }: { categories: CategoryView[]; category: string; setCategory: (value: string) => void; onSelect?: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">分类</h2>
        {category ? <button type="button" onClick={() => setCategory("")} className="text-xs text-primary hover:underline">清除</button> : null}
      </div>
      <div className="space-y-1.5">
        {categories.map((item) => {
          const active = category === item.name || (!category && item.name === "全部技能");
          return <button type="button" key={item.name} onClick={() => { setCategory(item.name === "全部技能" ? "" : item.name); onSelect?.(); }} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors", active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <span>{item.name}</span><span className="flex items-center gap-2 text-xs">{item.count}{active ? <Check className="h-3.5 w-3.5" /> : null}</span>
          </button>;
        })}
      </div>
      <div className="mt-8 border-t pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">兼容环境</p>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          {["Codex", "Claude Code", "Cursor"].map((item) => <label key={item} className="flex items-center gap-2"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />{item}</label>)}
        </div>
      </div>
    </div>
  );
}

function SortSelect({ value, onChange }: { value: SortOption; onChange: (value: SortOption) => void }) {
  return <label className="relative inline-flex items-center gap-2 self-start text-sm text-muted-foreground sm:self-auto">
    <span>排序</span>
    <span className="relative">
      <select value={value} onChange={(event) => onChange(event.target.value as SortOption)} className="h-9 appearance-none rounded-md border bg-background pl-3 pr-9 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15">
        <option value="relevance">最相关</option><option value="newest">最新发布</option><option value="downloads">下载最多</option><option value="stars">收藏最多</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  </label>;
}
