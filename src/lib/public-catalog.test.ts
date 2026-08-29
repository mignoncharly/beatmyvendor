import { describe, expect, it } from "vitest";
import { alternativesTo, getSoftware, softwareCatalog } from "./public-catalog";

describe("public software catalog", () => {
  it("has unique, URL-safe slugs and valid HTTPS websites", () => {
    expect(new Set(softwareCatalog.map(({ slug }) => slug)).size).toBe(softwareCatalog.length);
    for (const product of softwareCatalog) { expect(product.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/); expect(new URL(product.website).protocol).toBe("https:"); }
  });
  it("resolves known software and excludes it from alternatives", () => {
    expect(getSoftware("zendesk")?.name).toBe("Zendesk"); expect(getSoftware("unknown")).toBeUndefined(); expect(alternativesTo("zendesk")).toHaveLength(softwareCatalog.length - 1); expect(alternativesTo("zendesk").some(({ slug }) => slug === "zendesk")).toBe(false);
  });
});
