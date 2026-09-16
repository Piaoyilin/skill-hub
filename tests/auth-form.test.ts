import { describe, expect, it, vi } from "vitest";
import { navigateAfterAuth } from "../components/auth-form";

describe("AuthForm navigation", () => {
  it("navigates after login without forcing an extra refresh", () => {
    const router = {
      push: vi.fn(),
      refresh: vi.fn(),
    };

    navigateAfterAuth(router, "/dashboard");

    expect(router.push).toHaveBeenCalledWith("/dashboard");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
