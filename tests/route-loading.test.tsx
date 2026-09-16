import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteLoading } from "../components/route-loading";

describe("RouteLoading", () => {
  it("renders a lightweight loading state for dynamic routes", () => {
    const markup = renderToStaticMarkup(
      createElement(RouteLoading, {
        title: "正在打开 Skill",
        description: "正在读取 Skill 详情、版本和收藏状态。",
      }),
    );

    expect(markup).toContain("正在打开 Skill");
    expect(markup).toContain("正在读取 Skill 详情、版本和收藏状态。");
  });
});
