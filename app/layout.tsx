import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { NavigationTiming } from "@/components/navigation-timing";

export const metadata: Metadata = {
  title: "Skill Hub | AI Agent Skills 市场",
  description: "发现、创建和分享可复用的 AI Coding Agent Skills。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Navbar />
        <NavigationTiming />
        <main>{children}</main>
      </body>
    </html>
  );
}
