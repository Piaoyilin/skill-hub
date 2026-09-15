import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { VersionHistory } from "../components/skill-detail";
import type { SkillView } from "../lib/registry";

function createSkill(versions: SkillView["versions"]): SkillView {
  return {
    slug: "version-history-test",
    name: "版本历史测试",
    description: "用于测试版本历史展示。",
    category: "测试",
    tags: [],
    author: "测试用户",
    authorHandle: "tester",
    version: versions[0]?.version ?? "未发布",
    downloads: 0,
    stars: 0,
    updatedAt: "2026-09-15",
    createdAt: "2026-09-15",
    icon: "S",
    accent: "indigo",
    verified: false,
    files: [],
    readme: [],
    changelog: [],
    versions,
  };
}

describe("SkillDetail version history", () => {
  it("renders the latest version first and marks it as current", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionHistory, {
        skill: createSkill([
          {
            version: "1.1.0",
            publishedAt: "2026-09-15",
            changelog: [],
            isCurrent: true,
          },
          {
            version: "1.0.0",
            publishedAt: "2026-09-14",
            changelog: [],
            isCurrent: false,
          },
        ]),
      }),
    );

    expect(markup.indexOf("v1.1.0")).toBeLessThan(markup.indexOf("v1.0.0"));
    expect(markup).toContain("当前版本");
    expect(markup).not.toContain("vv1.1.0");
  });

  it("renders an empty state when there are no versions", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionHistory, { skill: createSkill([]) }),
    );

    expect(markup).toContain("暂无版本记录");
  });
});
