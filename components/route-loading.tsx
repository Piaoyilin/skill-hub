import { Loader2 } from "lucide-react";
import { Container } from "@/components/container";

type RouteLoadingProps = {
  title?: string;
  description?: string;
};

export function RouteLoading({
  title = "正在加载",
  description = "正在读取 Skill Hub 数据...",
}: RouteLoadingProps) {
  return (
    <Container className="py-12 sm:py-16">
      <div className="rounded-md border border-dashed bg-muted/35 p-8">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{title}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </Container>
  );
}
