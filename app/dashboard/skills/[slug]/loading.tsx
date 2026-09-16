import { RouteLoading } from "@/components/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="正在打开管理页"
      description="正在验证 Owner 权限并读取 Skill 配置。"
    />
  );
}
