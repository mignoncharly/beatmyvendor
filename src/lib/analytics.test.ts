import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsConfigured, capture, sanitizeProperties } from "./analytics";

describe("analytics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is dormant without a configured public key", () => {
    expect(analyticsConfigured()).toBe(false);
  });

  it("only forwards whitelisted primitive properties", () => {
    expect(sanitizeProperties({ path: "/buyer", email: "a@b.com", offer_count: 3, secret: "x", role: "buyer", note: {} }))
      .toEqual({ path: "/buyer", offer_count: 3, role: "buyer" });
  });

  it("makes no network request when dormant or before consent", () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    capture("page_view", { path: "/x" });
    expect(spy).not.toHaveBeenCalled();
  });
});
