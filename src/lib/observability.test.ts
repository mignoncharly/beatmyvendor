import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { redactContext } from "./observability";

describe("redactContext", () => {
  it("drops values under sensitive keys", () => {
    const out = redactContext({ email: "a@b.com", token: "secret", contact_name: "Bob", payment_id: "p1", count: 3 });
    expect(out.email).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.contact_name).toBe("[redacted]");
    expect(out.payment_id).toBe("p1");
    expect(out.count).toBe(3);
  });

  it("scrubs emails embedded in non-sensitive string values", () => {
    expect(redactContext({ note: "reached bob@corp.com today" }).note).toBe("reached [email] today");
  });

  it("truncates very long strings", () => {
    const value = redactContext({ blob: "x".repeat(400) }).blob as string;
    expect(value.length).toBeLessThanOrEqual(201);
    expect(value.endsWith("…")).toBe(true);
  });

  it("recurses into nested objects", () => {
    expect(redactContext({ meta: { secret: "x", ok: 1 } })).toEqual({ meta: { secret: "[redacted]", ok: 1 } });
  });
});
