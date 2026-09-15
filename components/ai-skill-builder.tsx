"use client";

import { useMemo, useState } from "react";
import { Check, Copy, FileCode2, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const examples = ["审查 React 性能问题", "为 FastAPI 生成 API 文档", "检查 Docker 镜像安全性"];

export function AiSkillBuilder() {
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("代码质量");
  const [stage, setStage] = useState<"form" | "generating" | "result">("form");
  const [copied, setCopied] = useState(false);

  const draft = useMemo(() => {
    const skillName = name.trim() || "工程工作流助手";
    const goal = description.trim() || "帮助团队更稳定地完成日常工程任务。";
    return `# ${skillName}

## 目标
${goal}

## 工作方式
1. 先阅读仓库上下文、配置文件和相关代码。
2. 识别高影响问题，并说明判断依据。
3. 给出可执行、可验证的修改建议。

## 输出要求
- 使用简洁的 Markdown。
- 标注风险、影响范围和优先级。
- 不执行未被明确授权的破坏性操作。

## 安全声明
- 不读取与任务无关的敏感信息。
- 不调用未声明的外部服务。
- 在执行命令前说明目的和影响。`;
  }, [description, name]);

  function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("generating");
    window.setTimeout(() => setStage("result"), 650);
  }

  async function copyDraft() {
    await navigator.clipboard?.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (stage === "generating") {
    return (
      <div className="mt-10 flex min-h-80 flex-col items-center justify-center rounded-md border bg-background text-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
        <h2 className="mt-4 text-sm font-semibold">正在整理 Skill 草稿</h2>
        <p className="mt-2 text-sm text-muted-foreground">根据你的描述生成工作方式、安全声明和输出格式。</p>
      </div>
    );
  }

  if (stage === "result") {
    return (
      <div className="mt-10 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">生成完成</p>
            <h2 className="mt-2 text-xl font-semibold">检查并编辑草稿</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">这是一个 Mock 结果。你可以复制内容，或返回修改描述。</p>
          </div>
          <div className="rounded-md border bg-muted/35 p-4 text-sm">
            <p className="text-xs text-muted-foreground">技能名称</p>
            <p className="mt-1 font-medium">{name || "工程工作流助手"}</p>
            <p className="mt-4 text-xs text-muted-foreground">分类</p>
            <p className="mt-1 font-medium">{category}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setStage("form")}>返回修改</Button>
        </div>
        <div className="min-w-0 rounded-md border bg-zinc-950">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-200"><FileCode2 className="h-4 w-4" />SKILL.md</span>
            <Button type="button" variant="ghost" size="sm" onClick={copyDraft} className="text-zinc-400 hover:bg-white/10 hover:text-white">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "已复制" : "复制"}
            </Button>
          </div>
          <pre className="code-scroll max-h-[620px] overflow-auto p-5 text-sm leading-7 text-zinc-300"><code>{draft}</code></pre>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={generate} className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <div>
          <label htmlFor="skill-name" className="text-sm font-medium">Skill 名称</label>
          <Input id="skill-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2" placeholder="例如：React 性能检查" />
        </div>
        <div>
          <label htmlFor="skill-description" className="text-sm font-medium">你希望它完成什么？</label>
          <textarea
            id="skill-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="描述触发场景、需要检查的内容，以及你希望 Agent 如何输出结果。"
            className="mt-2 min-h-52 w-full resize-y rounded-md border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <Button type="submit" className="w-full sm:w-auto"><Sparkles className="h-4 w-4" />生成 Skill 草稿</Button>
      </div>
      <aside className="space-y-5">
        <div>
          <p className="text-sm font-medium">分类</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {["代码质量", "开发效率", "文档生成", "测试", "安全", "DevOps"].map((item) => (
              <button type="button" key={item} onClick={() => setCategory(item)} className={cn("rounded-md border px-3 py-2 text-left text-xs transition", category === item ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item}</button>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-dashed p-4">
          <p className="text-xs font-medium">试试这样描述</p>
          <div className="mt-3 space-y-2">
            {examples.map((example) => <button type="button" key={example} onClick={() => setDescription(example)} className="block text-left text-xs leading-5 text-muted-foreground transition hover:text-foreground">{example}</button>)}
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />生成结果会包含目标、工作方式、输出要求和安全声明。</div>
      </aside>
    </form>
  );
}
