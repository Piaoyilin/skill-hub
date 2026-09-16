import { RouteLoading } from "@/components/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="正在打开 Skill"
      description="正在读取 Skill 详情、版本和收藏状态。"
    />
  );
}
