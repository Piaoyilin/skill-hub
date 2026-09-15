import type { RegistryDataSource } from "./types";

const DEFAULT_DATA_SOURCE: RegistryDataSource = "mock";

export function getSkillDataSource(): RegistryDataSource {
  const configured = process.env.SKILL_DATA_SOURCE?.trim().toLowerCase();

  if (!configured) {
    return DEFAULT_DATA_SOURCE;
  }

  if (configured === "mock" || configured === "database") {
    return configured;
  }

  throw new Error(
    `SKILL_DATA_SOURCE 配置无效：${configured}。只支持 mock 或 database。`,
  );
}
