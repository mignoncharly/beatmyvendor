import { afterEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("isCronAuthorized", () => {
  it("accepts only an exact bearer secret", () => {
    process.env.CRON_SECRET = "a-secure-worker-secret";
    expect(isCronAuthorized(new Request("https://example.com", {
      headers: { authorization: "Bearer a-secure-worker-secret" }
    }))).toBe(true);
    expect(isCronAuthorized(new Request("https://example.com", {
      headers: { authorization: "Bearer a-secure-worker-secrex" }
    }))).toBe(false);
  });

  it("fails closed when configuration or authorization is absent", () => {
    expect(isCronAuthorized(new Request("https://example.com"))).toBe(false);
    process.env.CRON_SECRET = "configured";
    expect(isCronAuthorized(new Request("https://example.com"))).toBe(false);
  });
});
