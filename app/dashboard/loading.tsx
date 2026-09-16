import { RouteLoading } from "@/components/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="正在打开个人中心"
      description="正在验证登录状态并读取你的 Skill。"
    />
  );
}
