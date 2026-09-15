import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FavoriteButton } from "../components/skill-detail";

describe("Skill detail favorite button", () => {
  it("renders the 收藏 state from initialFavorited=false", () => {
    const markup = renderToStaticMarkup(
      createElement(FavoriteButton, {
        slug: "demo-skill",
        initialFavorited: false,
      }),
    );

    expect(markup).toContain(">收藏</button>");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain(">已收藏</button>");
  });

  it("renders the 已收藏 state from initialFavorited=true", () => {
    const markup = renderToStaticMarkup(
      createElement(FavoriteButton, {
        slug: "demo-skill",
        initialFavorited: true,
      }),
    );

    expect(markup).toContain(">已收藏</button>");
    expect(markup).toContain('aria-pressed="true"');
  });
});
