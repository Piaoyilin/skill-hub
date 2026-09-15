import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function getConfiguredPrisma() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "已启用 database 数据源，但未配置 DATABASE_URL。请先在环境变量中配置 PostgreSQL 连接串。",
    );
  }

  return prisma;
}
