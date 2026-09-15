"use client";

import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBar({
  initialValue = "",
  value: controlledValue,
  onValueChange,
  large = false,
  className,
  placeholder = "搜索 Skill、技术栈或问题...",
}: {
  initialValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  large?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [internalValue, setInternalValue] = useState(initialValue);
  const value = controlledValue ?? internalValue;

  function updateValue(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/explore?q=${encodeURIComponent(query)}` : "/explore");
  }

  return (
    <form onSubmit={submit} className={cn("relative flex w-full items-center", className)}>
      <Search className={cn("pointer-events-none absolute left-4 text-muted-foreground", large ? "h-5 w-5" : "h-4 w-4")} />
      <Input value={value} onChange={(event) => updateValue(event.target.value)} placeholder={placeholder} aria-label="搜索 Skill" className={cn("pr-24", large ? "h-16 pl-12 text-base shadow-soft sm:text-lg" : "pl-11 text-sm")} />
      {value ? <Button type="button" variant="ghost" size="icon" aria-label="清除搜索" title="清除搜索" onClick={() => updateValue("")} className="absolute right-14 h-7 w-7"><X className="h-4 w-4" /></Button> : null}
      <Button type="submit" variant="default" size="icon" aria-label="提交搜索" title="搜索" className={cn("absolute right-2", large ? "h-11 w-11" : "h-7 w-7")}>{large ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-3.5 w-3.5" />}</Button>
    </form>
  );
}
